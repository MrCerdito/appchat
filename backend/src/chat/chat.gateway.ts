import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { SessionsService } from '../sessions/sessions.service';
import { AiService } from '../ai/ai.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { AdvisorsWhatsappService } from '../advisor-whatsapp/advisors-whatsapp.service';
import { Logger } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────
type TipoTimer = 'advisor' | 'client' | 'none';

interface TimerEntry {
  tipo: TipoTimer;
  timeout: NodeJS.Timeout | null;
  tick: NodeJS.Timeout | null;
  elapsed: number;
  iterCliente: number;
  advisorId: string;
  settingUp: boolean;
  startTime: number;
  totalSecs: number;
}

@WebSocketGateway({
  maxHttpBufferSize: 1_000_000,
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4200'],
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  // ── Maps internos ─────────────────────────────────────────────────────────
  private connectedAdvisors = new Map<string, Socket>();
  public advisorStatuses = new Map<string, string>(); // live status keyed by advisorId
  private waitingQueue: string[] = [];
  private sessionToSocket = new Map<string, string>();
  private clientPresence = new Map<
    string,
    {
      online: boolean;
      active: boolean;
      socketId: string | null;
      lastSeen: number;
    }
  >();
  private pollingInterval!: NodeJS.Timeout;
  private lunchInterval!: NodeJS.Timeout;
  private aiActiveSessions = new Set<string>();
  private timers = new Map<string, TimerEntry>();
  private messageRateLimit = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly MAX_MSG_PER_SEC = 10;

  /** Asesores en almuerzo activo — advisorId → finHora "HH:MM" */
  private advisorsOnLunch = new Map<string, string>();

  /** Asesores con almuerzo pendiente (tienen chats activos) */
  private advisorsPendingLunch = new Map<
    string,
    {
      inicioOriginal: string;
      finOriginal: string;
      duracionMs: number;
      inicioReal: Date;
    }
  >();

  /** Asesores que ya recibieron notificación de almuerzo próximo */
  private advisorsLunchNotified = new Set<string>();

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly configuracionService: ConfiguracionService,
    private readonly advisorsWhatsappService: AdvisorsWhatsappService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  afterInit() {
    this.pollingInterval = setInterval(
      () => this.assignPendingSessions(),
      3_000,
    );
    this.checkLunchBreaks();
    this.lunchInterval = setInterval(() => this.checkLunchBreaks(), 5_000);
  }

  // ── Conexión ──────────────────────────────────────────────────────────────
  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (token) {
      try {
        const secret = this.configService.get<string>('JWT_SECRET');
        const payload = this.jwtService.verify(token, { secret });
        const fullUser = await this.sessionsService
          .findAdvisorById(payload.sub)
          .catch(() => null);
        client.data.user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          profilePhotoUrl: fullUser?.profilePhotoUrl ?? null,
        };
        client.data.role = 'advisor';
        this.connectedAdvisors.set(payload.sub, client);
        this.logger.log(`[WS] Asesor conectado: ${payload.name}`);
        setTimeout(() => {
          this.checkLunchBreaks();
          this.assignPendingSessions();
        }, 300);
      } catch {
        client.data.role = 'client';
      }
    } else {
      client.data.role = 'client';
    }
  }

  // ── Desconexión ───────────────────────────────────────────────────────────
  handleDisconnect(client: Socket) {
    if (client.data.role === 'advisor') {
      const advisorId = client.data.user?.id;
      this.connectedAdvisors.delete(advisorId);
      this.advisorsOnLunch.delete(advisorId);
      this.advisorsPendingLunch.delete(advisorId);
      this.sessionsService.setAdvisorStatus(advisorId, 'offline');
      this.advisorStatuses.set(advisorId, 'offline');
      this.server.emit('advisor_status_changed', {
        advisorId,
        name: client.data.user.name,
        status: 'offline',
        profilePhotoUrl: client.data.user?.profilePhotoUrl ?? null,
      });
    }

    const sessionId = client.data.sessionId;
    if (sessionId && client.data.role === 'client') {
      this.removeFromQueue(sessionId);
      this.broadcastQueuePositions();
      this.sessionToSocket.delete(sessionId);
      this.clientPresence.set(sessionId, {
        online: false,
        active: false,
        socketId: null,
        lastSeen: Date.now(),
      });
      this.server.to(sessionId).emit('client_presence', {
        sessionId,
        online: false,
        active: false,
        lastSeen: new Date().toISOString(),
      });
    }
    if (sessionId) {
      this.messageRateLimit.delete(sessionId);
      this.server
        .to(sessionId)
        .emit('user_disconnected', { role: client.data.role });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADO DEL ASESOR
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('advisor_ready')
  async handleAdvisorReady(@ConnectedSocket() client: Socket) {
    if (client.data.role !== 'advisor') return;
    const advisor = await this.sessionsService.findAdvisorById(
      client.data.user.id,
    );
    const status = advisor?.status ?? 'online';
    this.advisorStatuses.set(client.data.user.id, status);
    this.server.emit('advisor_status_changed', {
      advisorId: client.data.user.id,
      name: advisor?.name ?? client.data.user.name,
      status,
      profilePhotoUrl:
        advisor?.profilePhotoUrl ?? client.data.user?.profilePhotoUrl ?? null,
    });
    await this.assignPendingSessions();
  }

  @SubscribeMessage('set_advisor_status')
  async handleSetAdvisorStatus(
    @MessageBody() status: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;

    if (status === 'online') {
      if (this.estaEnAlmuerzo(client.data.user.id)) {
        const finHora = this.advisorsOnLunch.get(client.data.user.id);
        client.emit('lunch_started', {
          fin: finHora ?? '',
          restante: '',
          inicio: '',
          finOriginal: '',
        });
        return;
      }
      if (this.tieneAlmuerzoPendiente(client.data.user.id)) {
        client.emit('lunch_pending', {
          mensaje: '',
          chats: 0,
          inicio: '',
          finOriginal: '',
        });
        return;
      }
    }

    const advisor = await this.sessionsService.setAdvisorStatus(
      client.data.user.id,
      status,
    );
    this.advisorStatuses.set(client.data.user.id, status);
    this.server.emit('advisor_status_changed', {
      advisorId: client.data.user.id,
      name: advisor?.name ?? client.data.user.name,
      status,
      profilePhotoUrl:
        advisor?.profilePhotoUrl ?? client.data.user?.profilePhotoUrl ?? null,
    });
    if (status === 'online') await this.assignPendingSessions();
  }

  @SubscribeMessage('get_all_advisors')
  async handleGetAllAdvisors(@ConnectedSocket() client: Socket) {
    const advisors = await this.sessionsService.findAllAdvisors();
    const list = advisors.map((a) => ({
      advisorId: a.id,
      name: a.name,
      status: (this.advisorStatuses.has(a.id)
        ? this.advisorStatuses.get(a.id)
        : a.status) as 'online' | 'busy' | 'offline',
      profilePhotoUrl: a.profilePhotoUrl ?? null,
    }));
    client.emit('all_advisors_list', list);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESIONES — UNIRSE / SOLICITAR ASESOR
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('join_session')
  async handleJoinSession(
    @MessageBody() data: { sessionId: string; clientName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.sessionId || typeof data.sessionId !== 'string') {
      client.emit('join_error', { reason: 'ID de sesión inválido' });
      return;
    }

    if (client.data.role === 'client') {
      try {
        const session = await this.sessionsService.findOne(data.sessionId);
        if (!session || session.status === 'closed') {
          client.emit('join_error', {
            reason: 'Sesión no válida o cerrada',
          });
          return;
        }
      } catch {
        client.emit('join_error', { reason: 'Sesión no encontrada' });
        return;
      }
    }

    client.join(data.sessionId);
    client.data.sessionId = data.sessionId;

    const history = await this.chatService.getHistory(data.sessionId, 50);
    client.emit('message_history', history);

    this.server.to(data.sessionId).emit('user_joined', {
      role: client.data.role,
      name: data.clientName ?? client.data.user?.name ?? 'Anónimo',
    });

    if (client.data.role === 'advisor') {
      const presence = this.clientPresence.get(data.sessionId);
      client.emit('client_presence', {
        sessionId: data.sessionId,
        online: presence?.online ?? false,
        active: presence?.active ?? false,
        lastSeen: presence?.lastSeen
          ? new Date(presence.lastSeen).toISOString()
          : undefined,
      });
    }

    if (client.data.role === 'client') {
      this.clientPresence.set(data.sessionId, {
        online: true,
        active: client.data.isActive === true,
        socketId: client.id,
        lastSeen: Date.now(),
      });
      this.server.to(data.sessionId).emit('client_presence', {
        sessionId: data.sessionId,
        online: true,
        active: client.data.isActive === true,
        lastSeen: new Date().toISOString(),
      });

      const session = await this.sessionsService.findOne(data.sessionId);
      if (session.status === 'waiting') {
        this.sessionToSocket.set(data.sessionId, client.id);
        const assigned = await this.autoAssignAdvisor(
          data.sessionId,
          session.clientName,
        );
        if (!assigned) {
          this.addToQueue(data.sessionId);
          this.emitQueuePosition(data.sessionId);
        }
      }
    }
  }

  @SubscribeMessage('request_advisor')
  async handleRequestAdvisor(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'client') return;
    const session = await this.sessionsService.requestAdvisor(sessionId);
    if (session.status !== 'waiting') return;
    this.server.emit('session_updated', { sessionId, status: 'waiting' });
    this.server.emit('metrics_updated', {
      type: 'session_status',
      sessionId,
      status: 'waiting',
    });
    this.sessionToSocket.set(sessionId, client.id);
    const assigned = await this.autoAssignAdvisor(
      sessionId,
      session.clientName,
    );
    if (!assigned) {
      this.addToQueue(sessionId);
      this.emitQueuePosition(sessionId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ★ COLABORACIÓN — UNIRSE / SALIR DE UN CHAT ACTIVO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Un asesor se une a un chat activo como apoyo.
   * NO reasigna la sesión — el asesor principal se mantiene.
   * Ambos asesores pueden ver y enviar mensajes.
   */

  @SubscribeMessage('join_active_chat')
  async handleJoinActiveChat(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log('[JoinActive] sessionId recibido:', sessionId);
    this.logger.log('[JoinActive] role:', client.data.role);
    this.logger.log('[JoinActive] client.id:', client.id);

    if (client.data.role !== 'advisor') return;

    const advisorId = client.data.user.id;
    const advisorName = client.data.user.name;

    if (this.estaEnAlmuerzo(advisorId)) {
      client.emit('join_chat_error', { reason: 'Estás en pausa de almuerzo.' });
      return;
    }

    const session = await this.sessionsService
      .findOne(sessionId)
      .catch(() => null);
    this.logger.log('[JoinActive] session status:', session?.status);

    if (
      !session ||
      (session.status !== 'active' && session.status !== 'waiting')
    ) {
      client.emit('join_chat_error', {
        reason: 'La sesión no está disponible.',
      });
      return;
    }

    // Unir a la room
    client.join(sessionId);

    // Historial al asesor
    const history = await this.chatService.getHistory(sessionId, 50);
    client.emit('message_history', history);

    // Mensaje de sistema
    const msg = await this.chatService.saveMessage(
      sessionId,
      `${advisorName} se unió al chat como apoyo`,
      'advisor',
      'Sistema',
    );
    this.server.to(sessionId).emit('new_message', msg);

    // ✅ Confirmar al asesor
    this.logger.log('[JoinActive] emitiendo joined_chat_ok...');
    client.emit('joined_chat_ok', {
      sessionId,
      clientName: session.clientName,
    });
    this.logger.log('[JoinActive] joined_chat_ok emitido');

    this.server.to(sessionId).emit('advisor_joined_collab', {
      sessionId,
      advisorId,
      advisorName,
    });

    this.logger.log(
      `[Collab] ${advisorName} se unió al chat ${sessionId} como apoyo`,
    );
  }

  /**
   * Un asesor colaborador sale del chat.
   * El asesor principal NO puede usar esto — debe transferir o cerrar.
   */
  @SubscribeMessage('leave_active_chat')
  async handleLeaveActiveChat(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;

    const advisorId = client.data.user.id;
    const advisorName = client.data.user.name;

    const session = await this.sessionsService
      .findOne(sessionId)
      .catch(() => null);
    if (!session) return;

    // El asesor principal no puede "salir" — debe cerrar o transferir
    if (session.advisor?.id === advisorId) {
      client.emit('leave_chat_error', {
        reason: 'Eres el asesor principal. Usa transferir o cerrar.',
      });
      return;
    }

    // Sacar de la room
    client.leave(sessionId);

    // Mensaje de sistema
    const msg = await this.chatService.saveMessage(
      sessionId,
      `${advisorName} salió del chat`,
      'advisor',
      'Sistema',
    );
    this.server.to(sessionId).emit('new_message', msg);

    // Notificar a todos
    this.server.to(sessionId).emit('advisor_left_collab', {
      sessionId,
      advisorId,
      advisorName,
    });

    this.logger.log(`[Collab] ${advisorName} salió del chat ${sessionId}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MENSAJERÍA
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('takeover_session')
  async handleTakeoverSession(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;

    const newAdvisorId = client.data.user.id;
    const newAdvisorName = client.data.user.name;

    if (this.estaEnAlmuerzo(newAdvisorId)) {
      client.emit('takeover_error', { reason: 'Estas en pausa de almuerzo.' });
      return;
    }

    const before = await this.sessionsService
      .findOne(sessionId)
      .catch(() => null);
    if (
      !before ||
      (before.status !== 'active' && before.status !== 'waiting')
    ) {
      client.emit('takeover_error', {
        reason: 'El chat ya no esta disponible.',
      });
      return;
    }

    const oldAdvisorId = before.advisor?.id ?? null;
    const session = await this.sessionsService.takeOver(
      sessionId,
      newAdvisorId,
    );

    const oldSocket = oldAdvisorId
      ? this.connectedAdvisors.get(oldAdvisorId)
      : null;
    oldSocket?.leave(sessionId);
    if (oldSocket && oldAdvisorId !== newAdvisorId) {
      oldSocket.emit('session_taken', { sessionId, takenBy: newAdvisorName });
    }

    client.join(sessionId);
    client.emit('session_assigned', {
      sessionId,
      clientName: session.clientName,
    });

    this.cancelarTimerActivo(sessionId);
    this.timers.set(sessionId, {
      tipo: 'none',
      timeout: null,
      tick: null,
      elapsed: 0,
      iterCliente: 0,
      advisorId: newAdvisorId,
      settingUp: false,
      startTime: 0,
      totalSecs: 0,
    });
    await this.iniciarTimers(sessionId, newAdvisorId);

    const msg = await this.chatService.saveMessage(
      sessionId,
      `${newAdvisorName} tomo el chat para continuar la atencion`,
      'advisor',
      'Sistema',
    );
    this.server.to(sessionId).emit('new_message', msg);
    this.server.emit('session_updated', { sessionId, status: 'active' });
    this.server.emit('metrics_updated', {
      type: 'session_status',
      sessionId,
      status: 'active',
    });

    for (const advisorId of [oldAdvisorId, newAdvisorId].filter(
      Boolean,
    ) as string[]) {
      const advisor = await this.sessionsService.findAdvisorById(advisorId);
      if (advisor) {
        this.advisorStatuses.set(advisor.id, advisor.status);
        this.server.emit('advisor_status_changed', {
          advisorId: advisor.id,
          name: advisor.name,
          status: advisor.status,
          activeChats: advisor.activeChats,
          profilePhotoUrl: advisor.profilePhotoUrl ?? null,
        });
      }
    }

    if (oldAdvisorId) await this.activarLunchPendiente(oldAdvisorId);
    this.removeFromQueue(sessionId);
    this.broadcastQueuePositions();
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody()
    data: { sessionId: string; content: string; senderName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = data.sessionId;
    const now = Date.now();
    const rateEntry = this.messageRateLimit.get(sessionId);
    if (rateEntry && now < rateEntry.resetAt) {
      rateEntry.count++;
      if (rateEntry.count > this.MAX_MSG_PER_SEC) {
        client.emit('message_error', {
          reason: 'Demasiados mensajes. Intenta de nuevo en un momento.',
        });
        return;
      }
    } else {
      this.messageRateLimit.set(sessionId, { count: 1, resetAt: now + 1000 });
    }

    const senderType = client.data.role as 'client' | 'advisor';
    const senderName =
      senderType === 'advisor'
        ? client.data.user?.name
        : (data.senderName ?? 'Cliente');

    const message = await this.chatService
      .saveMessage(data.sessionId, data.content, senderType, senderName)
      .catch((error) => {
        client.emit('message_error', {
          reason: error?.message ?? 'Mensaje invalido',
        });
        return null;
      });
    if (!message) return;
    this.server.to(data.sessionId).emit('new_message', message);

    if (senderType === 'client') {
      this.clientPresence.set(data.sessionId, {
        online: true,
        active: true,
        socketId: client.id,
        lastSeen: Date.now(),
      });
      this.server.to(data.sessionId).emit('client_presence', {
        sessionId: data.sessionId,
        online: true,
        active: true,
        lastSeen: new Date().toISOString(),
      });
      await this.cambiarTurno(data.sessionId, 'advisor', true);
    } else if (senderType === 'advisor') {
      await this.cambiarTurno(data.sessionId, 'client', false);
    }

    if (senderType === 'client' && this.aiActiveSessions.has(data.sessionId)) {
      this.respondWithAi(data.sessionId, data.content).catch((err) =>
        this.logger.error('[AutoIA]', err.message),
      );
    }
    if (senderType === 'advisor' && this.aiActiveSessions.has(data.sessionId)) {
      this.aiActiveSessions.delete(data.sessionId);
      this.server.to(data.sessionId).emit('ai_mode_changed', { active: false });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRANSFERIR SESIÓN
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('transfer_session')
  async handleTransfer(
    @MessageBody() data: { sessionId: string; newAdvisorId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;

    if (this.estaEnAlmuerzo(data.newAdvisorId)) {
      client.emit('transfer_error', {
        reason: 'El asesor está en pausa de almuerzo.',
      });
      return;
    }

    const session = await this.sessionsService.transfer(
      data.sessionId,
      data.newAdvisorId,
    );
    const newSocket = this.connectedAdvisors.get(data.newAdvisorId);

    this.cancelarTimerActivo(data.sessionId);
    this.timers.set(data.sessionId, {
      tipo: 'none',
      timeout: null,
      tick: null,
      elapsed: 0,
      iterCliente: 0,
      advisorId: data.newAdvisorId,
      settingUp: false,
      startTime: 0,
      totalSecs: 0,
    });
    await this.iniciarTimers(data.sessionId, data.newAdvisorId);

    if (newSocket) {
      newSocket.join(data.sessionId);
      newSocket.emit('session_assigned', {
        sessionId: data.sessionId,
        clientName: session.clientName,
      });
    }
    this.server.to(data.sessionId).emit('advisor_joined', {
      name: session.advisor?.name ?? 'Nuevo asesor',
      profilePhotoUrl: session.advisor?.profilePhotoUrl ?? null,
    });
    client.leave(data.sessionId);

    const msg = await this.chatService.saveMessage(
      data.sessionId,
      `Chat transferido a ${session.advisor?.name ?? 'otro asesor'}`,
      'advisor',
      'Sistema',
    );
    this.server.to(data.sessionId).emit('new_message', msg);
    this.server.emit('session_updated', {
      sessionId: data.sessionId,
      status: 'active',
    });
    this.server.emit('metrics_updated', {
      type: 'session_status',
      sessionId: data.sessionId,
      status: 'active',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CERRAR SESIÓN
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('close_session')
  async handleCloseSession(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;
    const session = await this.sessionsService
      .findOne(sessionId)
      .catch(() => null);
    const advisorId = session?.advisor?.id ?? client.data.user?.id;

    await this.sessionsService.close(sessionId);
    this.eliminarTimer(sessionId);

    this.server.to(sessionId).emit('session_closed', { sessionId });
    this.server.emit('session_updated', { sessionId, status: 'closed' });

    if (advisorId) {
      const a = await this.sessionsService.findAdvisorById(advisorId);
      if (a) {
        this.advisorStatuses.set(a.id, a.status);
        this.server.emit('advisor_status_changed', {
          advisorId: a.id,
          name: a.name,
          status: a.status,
          activeChats: a.activeChats,
          profilePhotoUrl: a.profilePhotoUrl ?? null,
        });
      }
      await this.activarLunchPendiente(advisorId);
    }
    this.removeFromQueue(sessionId);
    this.messageRateLimit.delete(sessionId);
    this.sessionToSocket.delete(sessionId);
    this.broadcastQueuePositions();
    await this.assignPendingSessions();
  }

  @SubscribeMessage('client_close_session')
  async handleClientClose(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'client') return;

    if (client.data.sessionId !== sessionId) {
      client.emit('close_error', {
        reason: 'No autorizado para cerrar esta sesión',
      });
      return;
    }

    const session = await this.sessionsService
      .findOne(sessionId)
      .catch(() => null);
    const advisorId = session?.advisor?.id ?? null;

    await this.sessionsService.close(sessionId);
    this.eliminarTimer(sessionId);

    this.server.to(sessionId).emit('session_closed', { sessionId });
    this.server.emit('session_updated', { sessionId, status: 'closed' });
    this.server.emit('metrics_updated', { type: 'session_closed', sessionId });

    if (advisorId) {
      const a = await this.sessionsService.findAdvisorById(advisorId);
      if (a) {
        this.advisorStatuses.set(a.id, a.status);
        this.server.emit('advisor_status_changed', {
          advisorId: a.id,
          name: a.name,
          status: a.status,
          activeChats: a.activeChats,
          profilePhotoUrl: a.profilePhotoUrl ?? null,
        });
      }
      await this.activarLunchPendiente(advisorId);
    }
    this.removeFromQueue(sessionId);
    this.messageRateLimit.delete(sessionId);
    this.sessionToSocket.delete(sessionId);
    this.broadcastQueuePositions();
    await this.assignPendingSessions();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TYPING / LECTURA
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.to(sessionId).emit('typing_start', {
      name: client.data.role === 'advisor' ? client.data.user?.name : 'Cliente',
      role: client.data.role,
      sessionId,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.to(sessionId).emit('typing_stop', { sessionId });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @MessageBody() sessionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const senderType = client.data.role === 'advisor' ? 'client' : 'advisor';
    await this.chatService.markAsRead(sessionId, senderType);
    client
      .to(sessionId)
      .emit('messages_read', { sessionId, readBy: client.data.role });
  }

  @SubscribeMessage('set_active')
  handleSetActive(
    @MessageBody() data: { sessionId: string; active: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    client.data.isActive = data.active;
    if (client.data.role === 'client') {
      this.clientPresence.set(data.sessionId, {
        online: true,
        active: data.active,
        socketId: client.id,
        lastSeen: Date.now(),
      });
      this.server.to(data.sessionId).emit('client_presence', {
        sessionId: data.sessionId,
        online: true,
        active: data.active,
        lastSeen: new Date().toISOString(),
      });
    }
    if (data.active) {
      const senderType = client.data.role === 'advisor' ? 'client' : 'advisor';
      this.chatService.markAsRead(data.sessionId, senderType).then(() => {
        client.to(data.sessionId).emit('messages_read', {
          sessionId: data.sessionId,
          readBy: client.data.role,
        });
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTELIGENCIA ARTIFICIAL
  // ══════════════════════════════════════════════════════════════════════════

  @SubscribeMessage('remit_to_ai')
  async handleRemitToAi(
    @MessageBody() payload: string | { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;
    const sessionId =
      typeof payload === 'string' ? payload : payload?.sessionId;
    if (!sessionId) {
      client.emit('remit_ai_error', { reason: 'sessionId no recibido' });
      return;
    }

    this.aiActiveSessions.add(sessionId);
    this.server.to(sessionId).emit('ai_mode_changed', { active: true });
    client.emit('remit_ai_ok', { sessionId });

    const all = await this.chatService.getHistory(sessionId, 100);
    const lastClient = [...all]
      .reverse()
      .find((m) => m.senderType === 'client');
    if (lastClient) await this.respondWithAi(sessionId, lastClient.content);
  }

  @SubscribeMessage('deactivate_ai_mode')
  handleDeactivateAi(
    @MessageBody() payload: string | { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;
    const sessionId =
      typeof payload === 'string' ? payload : payload?.sessionId;
    if (!sessionId) return;
    this.aiActiveSessions.delete(sessionId);
    this.server.to(sessionId).emit('ai_mode_changed', { active: false });
  }

  private async respondWithAi(
    sessionId: string,
    clientMessage: string,
  ): Promise<void> {
    const session = await this.sessionsService.findOne(sessionId);
    const all = await this.chatService.getHistory(sessionId, 100);
    const history = all
      .filter((m) => m.content !== clientMessage || m.senderType !== 'client')
      .slice(-20)
      .map((m) => ({
        role:
          m.senderType === 'client' ? ('user' as const) : ('model' as const),
        text: m.content,
      }));

    this.server.to(sessionId).emit('typing_start', {
      name: 'Asistente Virtual',
      role: 'advisor',
      sessionId,
    });

    try {
      const result = await this.aiService.chat(
        clientMessage,
        history,
        session.clientName,
        session.colegio ?? '',
        session.tipoSolicitud ?? '',
      );
      this.server.to(sessionId).emit('typing_stop', { sessionId });

      if (result.transfer) {
        this.aiActiveSessions.delete(sessionId);
        this.server.to(sessionId).emit('ai_mode_changed', { active: false });
        return;
      }
      const saved = await this.chatService.saveMessage(
        sessionId,
        result.reply,
        'advisor',
        'Asistente Virtual',
      );
      this.server
        .to(sessionId)
        .emit('new_message', { ...saved, showFeedback: result.showFeedback });
    } catch (err) {
      this.server.to(sessionId).emit('typing_stop', { sessionId });
      this.logger.error('[AutoIA]', (err as Error).message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE TIMERS
  // ══════════════════════════════════════════════════════════════════════════

  private async iniciarTimers(
    sessionId: string,
    advisorId: string,
  ): Promise<void> {
    const history = await this.chatService.getHistory(sessionId, 50);
    const realMsgs = history.filter(
      (m) => m.senderName !== 'Sistema' && m.senderName !== 'Asistente Virtual',
    );
    const lastSender = realMsgs.at(-1)?.senderType ?? 'advisor';

    this.logger.log(
      `[Timer] Inicio sesión ${sessionId} — último real: ${lastSender}`,
    );

    if (lastSender === 'client') {
      await this.arrancarTimerAsesor(sessionId);
    } else {
      await this.arrancarTimerCliente(sessionId);
    }
  }

  private async cambiarTurno(
    sessionId: string,
    nuevoTurno: 'advisor' | 'client',
    resetIterCliente: boolean,
  ): Promise<void> {
    this.cancelarTimerActivo(sessionId);

    const entry = this.timers.get(sessionId);
    if (!entry) {
      this.logger.warn(
        `[Timer] cambiarTurno: no hay entry para sesión ${sessionId}`,
      );
      return;
    }

    if (resetIterCliente) entry.iterCliente = 0;

    if (nuevoTurno === 'advisor') {
      await this.arrancarTimerAsesor(sessionId);
    } else {
      await this.arrancarTimerCliente(sessionId);
    }
  }

  private async arrancarTimerAsesor(sessionId: string): Promise<void> {
    const entry = this.timers.get(sessionId);
    if (!entry || entry.settingUp) return;
    entry.settingUp = true;

    try {
      const config = await this.configuracionService
        .getEfectiva(entry.advisorId)
        .catch(() => null);
      if (!config) return;

      const total = config.asesorInactividadSeg;
      entry.tipo = 'advisor';
      entry.elapsed = 0;
      entry.startTime = Date.now();
      entry.totalSecs = total;

      this.emitTimer(sessionId, {
        tipo: 'advisor_waiting',
        total,
        elapsed: 0,
        mensaje: config.asesorInactividadMsg,
        iteracion: 0,
        maxIter: 0,
      });

      const tick = () => {
        const realElapsed = Math.floor((Date.now() - entry.startTime) / 1000);
        entry.elapsed = realElapsed;
        this.emitTimer(sessionId, {
          tipo: 'advisor_waiting',
          total,
          elapsed: realElapsed,
          mensaje: config.asesorInactividadMsg,
          iteracion: 0,
          maxIter: 0,
        });
        if (realElapsed < total) {
          const nextDelay = 1000 - ((Date.now() - entry.startTime) % 1000);
          entry.tick = setTimeout(tick, nextDelay);
        }
      };
      entry.tick = setTimeout(tick, 1000);

      const remainingMs = total * 1000 - (Date.now() - entry.startTime);
      entry.timeout = setTimeout(
        async () => {
          this.cancelarTimerActivo(sessionId);
          const session = await this.sessionsService
            .findOne(sessionId)
            .catch(() => null);
          if (!session || session.status !== 'active') return;

          const msg = await this.chatService.saveMessage(
            sessionId,
            config.asesorInactividadMsg,
            'advisor',
            'Sistema',
          );
          this.server.to(sessionId).emit('new_message', msg);
          this.logger.log(
            `[Timer] Asesor inactivo → mensaje enviado en ${sessionId}`,
          );

          await this.arrancarTimerCliente(sessionId);
        },
        Math.max(0, remainingMs),
      );
    } finally {
      if (!entry.timeout && !entry.tick) entry.settingUp = false;
    }
  }

  private async arrancarTimerCliente(sessionId: string): Promise<void> {
    const entry = this.timers.get(sessionId);
    if (!entry || entry.settingUp) return;
    entry.settingUp = true;

    try {
      const config = await this.configuracionService
        .getEfectiva(entry.advisorId)
        .catch(() => null);
      if (!config) return;

      const total = config.clienteInactividadSeg;
      entry.tipo = 'client';
      entry.elapsed = 0;
      entry.startTime = Date.now();
      entry.totalSecs = total;

      this.emitTimer(sessionId, {
        tipo: 'client_waiting',
        total,
        elapsed: 0,
        mensaje: config.clienteInactividadMsg,
        iteracion: entry.iterCliente,
        maxIter: config.clienteInactividadIters,
      });

      const tick = () => {
        const realElapsed = Math.floor((Date.now() - entry.startTime) / 1000);
        entry.elapsed = realElapsed;
        this.emitTimer(sessionId, {
          tipo: 'client_waiting',
          total,
          elapsed: realElapsed,
          mensaje: config.clienteInactividadMsg,
          iteracion: entry.iterCliente,
          maxIter: config.clienteInactividadIters,
        });
        if (realElapsed < total) {
          const nextDelay = 1000 - ((Date.now() - entry.startTime) % 1000);
          entry.tick = setTimeout(tick, nextDelay);
        }
      };
      entry.tick = setTimeout(tick, 1000);

      const remainingMs = total * 1000 - (Date.now() - entry.startTime);
      entry.timeout = setTimeout(
        async () => {
          this.cancelarTimerActivo(sessionId);
          const session = await this.sessionsService
            .findOne(sessionId)
            .catch(() => null);
          if (!session || session.status !== 'active') return;

          entry.iterCliente++;

          if (entry.iterCliente <= config.clienteInactividadIters) {
            const msg = await this.chatService.saveMessage(
              sessionId,
              config.clienteInactividadMsg,
              'advisor',
              'Sistema',
            );
            this.server.to(sessionId).emit('new_message', msg);
            this.logger.log(
              `[Timer] Cliente inactivo → aviso ${entry.iterCliente}/${config.clienteInactividadIters} en ${sessionId}`,
            );
            await this.arrancarTimerCliente(sessionId);
          } else {
            this.logger.log(
              `[Timer] Cerrando sesión ${sessionId} por inactividad del cliente`,
            );
            const msgCierre = await this.chatService.saveMessage(
              sessionId,
              config.clienteCierreMsg,
              'advisor',
              'Sistema',
            );
            this.server.to(sessionId).emit('new_message', msgCierre);
            this.emitTimer(sessionId, {
              tipo: 'closing',
              total: 3,
              elapsed: 0,
              mensaje: config.clienteCierreMsg,
              iteracion: entry.iterCliente,
              maxIter: config.clienteInactividadIters,
            });
            setTimeout(async () => {
              this.eliminarTimer(sessionId);
              await this.sessionsService.close(sessionId);
              this.server.to(sessionId).emit('session_closed', { sessionId });
              this.server.emit('session_updated', {
                sessionId,
                status: 'closed',
              });
              this.server.emit('metrics_updated', {
                type: 'session_closed',
                sessionId,
              });
              await this.assignPendingSessions();
            }, 3_000);
          }
        },
        Math.max(0, remainingMs),
      );
    } finally {
      if (!entry.timeout && !entry.tick) entry.settingUp = false;
    }
  }

  private cancelarTimerActivo(sessionId: string): void {
    const entry = this.timers.get(sessionId);
    if (!entry) return;
    if (entry.tick) {
      clearInterval(entry.tick);
      entry.tick = null;
    }
    if (entry.timeout) {
      clearTimeout(entry.timeout);
      entry.timeout = null;
    }
    entry.tipo = 'none';
    entry.elapsed = 0;
    entry.settingUp = false;
  }

  private eliminarTimer(sessionId: string): void {
    const entry = this.timers.get(sessionId);
    if (!entry) return;
    if (entry.tick) clearInterval(entry.tick);
    if (entry.timeout) clearTimeout(entry.timeout);
    entry.settingUp = false;
    this.timers.delete(sessionId);
  }

  private emitTimer(
    sessionId: string,
    data: {
      tipo: 'advisor_waiting' | 'client_waiting' | 'closing';
      total: number;
      elapsed: number;
      mensaje: string;
      iteracion: number;
      maxIter: number;
    },
  ): void {
    this.server.to(sessionId).emit('timer_update', { sessionId, ...data });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASIGNACIÓN AUTOMÁTICA
  // ══════════════════════════════════════════════════════════════════════════

  private isAssigning = false;

  private async assignPendingSessions(): Promise<void> {
    if (this.isAssigning) return;
    this.isAssigning = true;
    try {
      const waiting = await this.sessionsService.findWaitingSessions();
      for (const session of waiting) {
        const hasAvailable =
          await this.sessionsService.findAvailableAdvisorFromList([
            ...this.connectedAdvisors.keys(),
          ]);
        if (!hasAvailable) break;
        await this.autoAssignAdvisor(session.id, session.clientName);
      }
    } finally {
      this.isAssigning = false;
    }
  }

  private async autoAssignAdvisor(
    sessionId: string,
    clientName: string,
  ): Promise<boolean> {
    const session = await this.sessionsService.findOne(sessionId);
    if (session.status !== 'waiting') return false;

    const connectedIds = [...this.connectedAdvisors.keys()];
    if (!connectedIds.length) return false;

    const disponiblesIds = connectedIds.filter(
      (id) => !this.estaEnAlmuerzo(id),
    );
    if (!disponiblesIds.length) {
      this.logger.log(
        '[Assign] Todos los asesores conectados están en almuerzo.',
      );
      return false;
    }

    const advisor =
      await this.sessionsService.findAvailableAdvisorFromList(disponiblesIds);
    if (!advisor) return false;

    if (this.estaEnAlmuerzo(advisor.id)) {
      this.logger.log(
        `[Assign] Asesor ${advisor.name} está en almuerzo, salteando.`,
      );
      return false;
    }

    const advisorSocket = this.connectedAdvisors.get(advisor.id);
    if (!advisorSocket) {
      this.connectedAdvisors.delete(advisor.id);
      return false;
    }

    const assigned = await this.sessionsService.assignAdvisor(
      sessionId,
      advisor.id,
    );
    if (assigned.status !== 'active') return false;

    advisorSocket.join(sessionId);
    this.server.to(sessionId).emit('advisor_joined', {
      name: advisor.name,
      profilePhotoUrl: advisor.profilePhotoUrl ?? null,
    });
    advisorSocket.emit('session_assigned', { sessionId, clientName });
    this.server.emit('session_updated', { sessionId, status: 'active' });
    this.server.emit('metrics_updated', {
      type: 'session_status',
      sessionId,
      status: 'active',
    });
    const refreshedAdvisor = await this.sessionsService.findAdvisorById(
      advisor.id,
    );
    if (refreshedAdvisor) {
      this.advisorStatuses.set(refreshedAdvisor.id, refreshedAdvisor.status);
      this.server.emit('advisor_status_changed', {
        advisorId: refreshedAdvisor.id,
        name: refreshedAdvisor.name,
        status: refreshedAdvisor.status,
        activeChats: refreshedAdvisor.activeChats,
        profilePhotoUrl: refreshedAdvisor.profilePhotoUrl ?? null,
      });
    }

    this.removeFromQueue(sessionId);
    this.sessionToSocket.delete(sessionId);
    this.broadcastQueuePositions();

    this.timers.set(sessionId, {
      tipo: 'none',
      timeout: null,
      tick: null,
      elapsed: 0,
      iterCliente: 0,
      advisorId: advisor.id,
      settingUp: false,
      startTime: 0,
      totalSecs: 0,
    });

    await this.enviarBienvenidaAsesor(sessionId, advisor.name, advisor.id);
    await this.iniciarTimers(sessionId, advisor.id);

    this.logger.log(`[Assign] ✓ ${sessionId} → ${advisor.name}`);
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BIENVENIDA AUTOMÁTICA
  // ══════════════════════════════════════════════════════════════════════════

  private async enviarBienvenidaAsesor(
    sessionId: string,
    advisorName: string,
    advisorId: string,
  ): Promise<void> {
    const history = await this.chatService.getHistory(sessionId, 50);

    const yaRespondio = history.some(
      (m) =>
        m.senderType === 'advisor' &&
        m.senderName !== 'Sistema' &&
        m.senderName !== 'Asistente Virtual',
    );
    if (yaRespondio) return;

    const config = await this.configuracionService
      .getEfectiva(advisorId)
      .catch(() => null);

    if (!config?.mensajeBienvenida?.trim()) return;

    const texto = config.mensajeBienvenida.replace(
      /\{\{asesor\}\}/gi,
      advisorName,
    );
    const msg = await this.chatService.saveMessage(
      sessionId,
      texto,
      'advisor',
      advisorName,
    );
    this.server.to(sessionId).emit('new_message', msg);
    this.logger.log(`[Bienvenida] "${texto}" → sesión ${sessionId}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE ALMUERZO
  // ══════════════════════════════════════════════════════════════════════════

  private async checkLunchBreaks(): Promise<void> {
    const ahora = new Date();
    const diaSem = ahora.getDay();
    const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    const entries = [...this.connectedAdvisors];
    const configs = await Promise.all(
      entries.map(([advisorId]) =>
        this.configuracionService.getEfectiva(advisorId).catch(() => null),
      ),
    );

    await Promise.all(
      entries.map(async ([advisorId, socket], i) => {
        try {
          const config = configs[i];
          if (!config) return;

          const almuerzos: Array<{ dia: number; inicio: string; fin: string }> =
            (config as any).almuerzos ?? [];

          const almuerzoHoy = almuerzos.find((a) => a.dia === diaSem);
          const enHorario = almuerzoHoy
            ? hhmm >= almuerzoHoy.inicio && hhmm < almuerzoHoy.fin
            : false;

          const enAlmuerzoActivo = this.advisorsOnLunch.has(advisorId);
          const pendiente = this.advisorsPendingLunch.has(advisorId);

          // ALMUERZO PRÓXIMO: faltan 5 min o menos
          if (!enAlmuerzoActivo && !pendiente && almuerzoHoy) {
            const [hInicio, mInicio] = almuerzoHoy.inicio
              .split(':')
              .map(Number);
            const inicioMs = new Date(ahora).setHours(hInicio, mInicio, 0, 0);
            const diffToStart = inicioMs - ahora.getTime();
            const cincoMinMs = 5 * 60 * 1000;

            if (
              diffToStart > 0 &&
              diffToStart <= cincoMinMs &&
              !this.advisorsLunchNotified.has(advisorId)
            ) {
              this.advisorsLunchNotified.add(advisorId);
              const minsRest = Math.ceil(diffToStart / 60000);
              socket.emit('lunch_approaching', {
                mensaje: `Tu hora de almuerzo (${almuerzoHoy.inicio}) se acerca. Faltan ${minsRest} minuto(s).`,
                minutos: minsRest,
                inicio: almuerzoHoy.inicio,
              });
            } else if (diffToStart > cincoMinMs || diffToStart <= 0) {
              this.advisorsLunchNotified.delete(advisorId);
            }
          }

          // ENTRÓ al horario de almuerzo
          if (enHorario && !enAlmuerzoActivo && !pendiente) {
            this.advisorsLunchNotified.delete(advisorId);
            await this.sessionsService
              .setAdvisorStatus(advisorId, 'busy')
              .catch(() => null);
            this.advisorStatuses.set(advisorId, 'busy');
            this.server.emit('advisor_status_changed', {
              advisorId,
              name: socket.data.user?.name,
              status: 'busy',
              profilePhotoUrl: socket.data.user?.profilePhotoUrl ?? null,
            });

            const [ih, im] = almuerzoHoy!.inicio.split(':').map(Number);
            const [fh, fm] = almuerzoHoy!.fin.split(':').map(Number);
            const duracionMs = (fh * 60 + fm - (ih * 60 + im)) * 60_000;

            const chatsActivos =
              await this.countChatsActivosAlmuerzo(advisorId);

            if (chatsActivos.total > 0) {
              this.advisorsLunchNotified.delete(advisorId);
              this.advisorsPendingLunch.set(advisorId, {
                inicioOriginal: almuerzoHoy!.inicio,
                finOriginal: almuerzoHoy!.fin,
                duracionMs,
                inicioReal: ahora,
              });
              socket.emit('lunch_pending', {
                mensaje: `Tienes ${chatsActivos.total} chat(s) activo(s). Termínalos para iniciar tu pausa de almuerzo.`,
                chats: chatsActivos.total,
                chatsWeb: chatsActivos.web,
                chatsWhatsapp: chatsActivos.whatsapp,
                inicio: almuerzoHoy!.inicio,
                finOriginal: almuerzoHoy!.fin,
              });
            } else {
              this.advisorsLunchNotified.delete(advisorId);
              await this.iniciarAlmuerzoAhora(
                advisorId,
                socket,
                almuerzoHoy!.inicio,
                almuerzoHoy!.fin,
                duracionMs,
                ahora,
              );
            }
          }

          // SALIÓ del horario (fin natural)
          else if (!enHorario && enAlmuerzoActivo) {
            const finAjustado = this.advisorsOnLunch.get(advisorId)!;
            const [h, m] = finAjustado.split(':').map(Number);
            const finAjMs = new Date(ahora).setHours(h, m, 0, 0);

            if (ahora.getTime() >= finAjMs) {
              await this.terminarAlmuerzo(advisorId, socket);
            }
          }

          // Salió del horario antes de aprobar pendiente
          else if (pendiente && !enHorario) {
            const pendData = this.advisorsPendingLunch.get(advisorId);
            if (pendData && hhmm >= pendData.finOriginal) {
              this.advisorsPendingLunch.delete(advisorId);
              await this.sessionsService
                .setAdvisorStatus(advisorId, 'online')
                .catch(() => null);
              this.advisorStatuses.set(advisorId, 'online');
              this.server.emit('advisor_status_changed', {
                advisorId,
                name: socket.data.user?.name,
                status: 'online',
                profilePhotoUrl: socket.data.user?.profilePhotoUrl ?? null,
              });
              socket.emit('lunch_pending_cancelled');
              this.logger.log(
                `[Almuerzo] ❌ ${socket.data.user?.name} horario de almuerzo expiró (tenía chats activos)`,
              );
              return;
            }
            await this.activarLunchPendiente(advisorId);
          }
          // Pendiente pero dentro de horario (sigue esperando)
          else if (pendiente) {
            await this.activarLunchPendiente(advisorId);
          }
        } catch (err) {
          this.logger.error(
            `[Almuerzo] Error verificando ${advisorId}:`,
            (err as Error).message,
          );
        }
      }),
    );
  }

  private async iniciarAlmuerzoAhora(
    advisorId: string,
    socket: Socket,
    inicioOriginal: string,
    finOriginal: string,
    duracionMs: number,
    inicioReal: Date,
  ): Promise<void> {
    const finAjMs = inicioReal.getTime() + duracionMs;
    const finAjDate = new Date(finAjMs);
    const finAjHora = `${String(finAjDate.getHours()).padStart(2, '0')}:${String(finAjDate.getMinutes()).padStart(2, '0')}`;

    this.advisorsOnLunch.set(advisorId, finAjHora);
    this.advisorsPendingLunch.delete(advisorId);

    const ahora = new Date();
    const diffMs = Math.max(0, finAjMs - ahora.getTime());
    const restMins = Math.floor(diffMs / 60000);
    const restSegs = Math.floor((diffMs % 60000) / 1000);
    const restante = `${String(restMins).padStart(2, '0')}:${String(restSegs).padStart(2, '0')}`;

    socket.emit('lunch_started', {
      fin: finAjHora,
      restante,
      inicio: inicioOriginal,
      finOriginal,
    });

    const ajuste =
      finAjHora !== finOriginal
        ? ` (ajustado de ${finOriginal} a ${finAjHora})`
        : '';
    this.logger.log(
      `[Almuerzo] 🍽️  ${socket.data.user?.name} almuerzo hasta ${finAjHora}${ajuste}`,
    );
  }

  private async terminarAlmuerzo(
    advisorId: string,
    socket: Socket,
  ): Promise<void> {
    this.advisorsOnLunch.delete(advisorId);
    await this.sessionsService
      .setAdvisorStatus(advisorId, 'online')
      .catch(() => null);
    this.advisorStatuses.set(advisorId, 'online');
    this.server.emit('advisor_status_changed', {
      advisorId,
      name: socket.data.user?.name,
      status: 'online',
      profilePhotoUrl: socket.data.user?.profilePhotoUrl ?? null,
    });
    socket.emit('lunch_ended');
    this.logger.log(
      `[Almuerzo] ✅ ${socket.data.user?.name} volvió del almuerzo`,
    );
    await this.assignPendingSessions();
  }

  private async countChatsActivosAlmuerzo(
    advisorId: string,
  ): Promise<{ web: number; whatsapp: number; total: number }> {
    const [web, whatsapp] = await Promise.all([
      this.sessionsService
        .findActiveSessionsByAdvisor(advisorId)
        .then((chats) => chats.length)
        .catch(() => 0),
      this.advisorsWhatsappService
        .countActiveChatsByAdvisor(advisorId)
        .catch(() => 0),
    ]);
    return { web, whatsapp, total: web + whatsapp };
  }

  private async activarLunchPendiente(advisorId: string): Promise<void> {
    const pendiente = this.advisorsPendingLunch.get(advisorId);
    if (!pendiente) return;

    const chatsActivos = await this.countChatsActivosAlmuerzo(advisorId);

    if (chatsActivos.total > 0) return;

    const socket = this.connectedAdvisors.get(advisorId);
    if (!socket) {
      this.advisorsPendingLunch.delete(advisorId);
      return;
    }

    const ahora = new Date();
    await this.iniciarAlmuerzoAhora(
      advisorId,
      socket,
      pendiente.inicioOriginal,
      pendiente.finOriginal,
      pendiente.duracionMs,
      ahora,
    );
  }

  private estaEnAlmuerzo(advisorId: string): boolean {
    return this.advisorsOnLunch.has(advisorId);
  }

  private tieneAlmuerzoPendiente(advisorId: string): boolean {
    return this.advisorsPendingLunch.has(advisorId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLA DE ESPERA
  // ══════════════════════════════════════════════════════════════════════════

  private addToQueue(sessionId: string): void {
    if (!this.waitingQueue.includes(sessionId))
      this.waitingQueue.push(sessionId);
  }

  private removeFromQueue(sessionId: string): void {
    const idx = this.waitingQueue.indexOf(sessionId);
    if (idx !== -1) this.waitingQueue.splice(idx, 1);
  }

  private emitQueuePosition(sessionId: string): void {
    const pos = this.waitingQueue.indexOf(sessionId);
    if (pos === -1) return;
    const socketId = this.sessionToSocket.get(sessionId);
    if (!socketId) return;
    const socket = this.server.sockets.sockets.get(socketId);
    socket?.emit('queue_position', {
      position: pos,
      total: this.waitingQueue.length,
    });
  }

  private broadcastQueuePositions(): void {
    this.waitingQueue.forEach((sessionId, index) => {
      const socketId = this.sessionToSocket.get(sessionId);
      if (!socketId) return;
      const socket = this.server.sockets.sockets.get(socketId);
      socket?.emit('queue_position', {
        position: index,
        total: this.waitingQueue.length,
      });
    });
  }
}
