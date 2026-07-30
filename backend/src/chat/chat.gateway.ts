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
import { RedisStateService } from '../common/redis/redis-state.service';
import { Attachment } from './entities/message.entity';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────
type TipoTimer = 'advisor' | 'client' | 'reconnection' | 'none';

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
  maxHttpBufferSize: 2_000_000,
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

  // ── Local-only state (timers hold NodeJS.Timeout objects) ────────────────
  private pollingInterval!: NodeJS.Timeout;
  private lunchInterval!: NodeJS.Timeout;
  private timers = new Map<string, TimerEntry>();
  private readonly MAX_MSG_PER_SEC = 10;

  // ── Distributed state via Redis ──────────────────────────────────────────
  // connectedAdvisors → Redis SET + advisor:{id} rooms
  // advisorStatuses → Redis HASH
  // waitingQueue → Redis LIST
  // sessionToSocket → Redis HASH
  // clientPresence → Redis HASH (JSON)
  // messageRateLimit → Redis HASH (JSON)
  // aiActiveSessions → Redis SET
  // advisorsOnLunch → Redis HASH
  // advisorsPendingLunch → Redis HASH (JSON)
  // advisorsLunchNotified → Redis SET

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly configuracionService: ConfiguracionService,
    private readonly advisorsWhatsappService: AdvisorsWhatsappService,
    private readonly redisState: RedisStateService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API (used by other modules)
  // ══════════════════════════════════════════════════════════════════════════

  async getAdvisorStatus(advisorId: string): Promise<string | null> {
    return this.redisState.getAdvisorStatus(advisorId);
  }

  async getAdvisorStatuses(): Promise<Record<string, string>> {
    return this.redisState.getAdvisorStatuses();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  async afterInit() {
    // ── Socket.IO Redis Adapter for cross-instance broadcasting ─────────
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { default: Redis } = await import('ioredis');
      const redisUrl =
        this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

      const pubClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });
      const subClient = pubClient.duplicate();

      await Promise.all([
        new Promise<void>((resolve) => pubClient.once('ready', resolve)),
        new Promise<void>((resolve) => subClient.once('ready', resolve)),
      ]);

      this.server.adapter(createAdapter(pubClient, subClient));
      this.logger.log(
        '[Redis Adapter] Socket.IO cross-instance adapter activado',
      );
    } catch (err) {
      this.logger.error(
        `[Redis Adapter] Error al configurar adapter: ${(err as Error).message}`,
      );
      this.logger.warn('[Redis Adapter] Funcionando en modo single-instance');
    }

    this.pollingInterval = setInterval(
      () => this.assignPendingSessions(),
      10_000,
    );
    this.checkLunchBreaks();
    this.lunchInterval = setInterval(() => this.checkLunchBreaks(), 30_000);
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

        // Store in Redis + join advisor room for cross-instance messaging
        await this.redisState.addConnectedAdvisor(payload.sub);
        client.join(`advisor:${payload.sub}`);

        this.logger.log(
          `[WS] Asesor conectado: ${payload.name} (PID: ${process.pid})`,
        );

        // Cancel reconnection timers — advisor is back
        try {
          const activeSessions =
            await this.sessionsService.findActiveSessionsByAdvisor(payload.sub);
          for (const session of activeSessions) {
            const entry = this.timers.get(session.id);
            if (entry && entry.tipo === 'reconnection') {
              this.cancelarTimerActivo(session.id);
              this.server.to(session.id).emit('reconnection_ok', {
                sessionId: session.id,
              });
            }
          }
        } catch {}

        setTimeout(() => {
          this.checkLunchBreaks();
          this.assignPendingSessions();
          this.assignWaitingWhatsappChats().catch((err) =>
            this.logger.warn(`[WA Assign] Error en conexión: ${err.message}`),
          );
        }, 300);
      } catch {
        client.data.role = 'client';
      }
    } else {
      client.data.role = 'client';
    }
  }

  // ── Desconexión ───────────────────────────────────────────────────────────
  async handleDisconnect(client: Socket) {
    if (client.data.role === 'advisor') {
      const advisorId = client.data.user?.id;
      const advisorName = client.data.user?.name;

      // Start reconnection timers for active sessions
      if (advisorId) {
        const activeSessions = await this.sessionsService
          .findActiveSessionsByAdvisor(advisorId)
          .catch(() => []);
        for (const session of activeSessions) {
          await this.arrancarTimerReconexion(
            session.id,
            advisorId,
            advisorName,
          );
        }
      }

      // Remove from Redis + local state
      await this.redisState.cleanupAdvisor(advisorId);
      await this.sessionsService.setAdvisorStatus(advisorId, 'offline');
      this.server.emit('advisor_status_changed', {
        advisorId,
        name: client.data.user.name,
        status: 'offline',
        profilePhotoUrl: client.data.user?.profilePhotoUrl ?? null,
      });
    }

    const sessionId = client.data.sessionId;
    if (sessionId && client.data.role === 'client') {
      await this.redisState.removeFromQueue(sessionId);
      await this.broadcastQueuePositions();
      await this.redisState.deleteSessionSocket(sessionId);
      await this.redisState.setClientPresence(sessionId, {
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
      await this.redisState.deleteRateLimit(sessionId);
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
    await this.redisState.setAdvisorStatus(client.data.user.id, status);
    this.server.emit('advisor_status_changed', {
      advisorId: client.data.user.id,
      name: advisor?.name ?? client.data.user.name,
      status,
      profilePhotoUrl:
        advisor?.profilePhotoUrl ?? client.data.user?.profilePhotoUrl ?? null,
    });
    await this.assignPendingSessions();
    await this.assignWaitingWhatsappChats();
  }

  @SubscribeMessage('set_advisor_status')
  async handleSetAdvisorStatus(
    @MessageBody() status: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;

    if (status === 'online') {
      if (await this.estaEnAlmuerzo(client.data.user.id)) {
        const finHora = await this.redisState.getOnLunch(client.data.user.id);
        client.emit('lunch_started', {
          fin: finHora ?? '',
          restante: '',
          inicio: '',
          finOriginal: '',
        });
        return;
      }
      if (await this.tieneAlmuerzoPendiente(client.data.user.id)) {
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
    await this.redisState.setAdvisorStatus(client.data.user.id, status);
    this.server.emit('advisor_status_changed', {
      advisorId: client.data.user.id,
      name: advisor?.name ?? client.data.user.name,
      status,
      profilePhotoUrl:
        advisor?.profilePhotoUrl ?? client.data.user?.profilePhotoUrl ?? null,
    });
    if (status === 'online') {
      await this.assignPendingSessions();
      await this.assignWaitingWhatsappChats();
    }
  }

  @SubscribeMessage('get_all_advisors')
  async handleGetAllAdvisors(@ConnectedSocket() client: Socket) {
    const advisors = await this.sessionsService.findAllAdvisors();
    const statuses = await this.redisState.getAdvisorStatuses();
    const list = advisors.map((a) => ({
      advisorId: a.id,
      name: a.name,
      status: (statuses[a.id] ?? a.status) as 'online' | 'busy' | 'offline',
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
      if (client.data.sessionId && client.data.sessionId !== data.sessionId) {
        client.emit('join_error', {
          reason: 'Ya estás conectado a otra sesión',
        });
        return;
      }

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

    if (client.data.role === 'advisor') {
      try {
        const session = await this.sessionsService.findOne(data.sessionId);
        if (!session || session.status === 'closed') {
          client.emit('join_error', {
            reason: 'Sesión no encontrada o cerrada',
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
      const presence = await this.redisState.getClientPresence(data.sessionId);
      client.emit('client_presence', {
        sessionId: data.sessionId,
        online: presence?.online ?? false,
        active: presence?.active ?? false,
        lastSeen: presence?.lastSeen
          ? new Date(presence.lastSeen).toISOString()
          : undefined,
      });

      // Cancel reconnection timer — advisor is back
      const entry = this.timers.get(data.sessionId);
      if (entry && entry.tipo === 'reconnection') {
        this.cancelarTimerActivo(data.sessionId);
        this.server.to(data.sessionId).emit('reconnection_ok', {
          sessionId: data.sessionId,
        });
        this.logger.log(
          `[Reconexion] Asesor reconectado a sesión ${data.sessionId}`,
        );
      }
    }

    if (client.data.role === 'client') {
      await this.redisState.setClientPresence(data.sessionId, {
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
        await this.redisState.setSessionSocket(data.sessionId, client.id);
        const assigned = await this.autoAssignAdvisor(
          data.sessionId,
          session.clientName,
        );
        if (!assigned) {
          await this.redisState.addToQueue(data.sessionId);
          await this.emitQueuePosition(data.sessionId);
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
    await this.redisState.setSessionSocket(sessionId, client.id);
    const assigned = await this.autoAssignAdvisor(
      sessionId,
      session.clientName,
    );
    if (!assigned) {
      await this.redisState.addToQueue(sessionId);
      await this.emitQueuePosition(sessionId);
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

    if (await this.estaEnAlmuerzo(advisorId)) {
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

    if (await this.estaEnAlmuerzo(newAdvisorId)) {
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

    // Notify old advisor via Redis adapter (cross-instance safe)
    if (oldAdvisorId && oldAdvisorId !== newAdvisorId) {
      this.server.to(`advisor:${oldAdvisorId}`).emit('session_taken', {
        sessionId,
        takenBy: newAdvisorName,
      });
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
      `Has sido asignado al asesor ${newAdvisorName}`,
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
        await this.redisState.setAdvisorStatus(advisor.id, advisor.status);
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
    await this.redisState.removeFromQueue(sessionId);
    await this.broadcastQueuePositions();
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody()
    data: {
      sessionId: string;
      content: string;
      senderName?: string;
      attachments?: Attachment[];
    },
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = data.sessionId;
    const now = Date.now();
    const rateEntry = await this.redisState.getRateLimit(sessionId);
    if (rateEntry && now < rateEntry.resetAt) {
      rateEntry.count++;
      if (rateEntry.count > this.MAX_MSG_PER_SEC) {
        client.emit('message_error', {
          reason: 'Demasiados mensajes. Intenta de nuevo en un momento.',
        });
        return;
      }
      await this.redisState.setRateLimit(sessionId, rateEntry);
    } else {
      await this.redisState.setRateLimit(sessionId, {
        count: 1,
        resetAt: now + 1000,
      });
    }

    const senderType = client.data.role as 'client' | 'advisor';
    const senderName =
      senderType === 'advisor'
        ? client.data.user?.name
        : (data.senderName ?? 'Cliente');

    const message = await this.chatService
      .saveMessage(
        data.sessionId,
        data.content,
        senderType,
        senderName,
        data.attachments,
      )
      .catch((error) => {
        client.emit('message_error', {
          reason: error?.message ?? 'Mensaje invalido',
        });
        return null;
      });
    if (!message) return;
    this.server.to(data.sessionId).emit('new_message', message);

    if (senderType === 'client') {
      await this.redisState.setClientPresence(data.sessionId, {
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

    const isAiActive = await this.redisState.isAiActive(data.sessionId);
    if (senderType === 'client' && isAiActive) {
      this.respondWithAi(data.sessionId, data.content).catch((err) =>
        this.logger.error('[AutoIA]', err.message),
      );
    }
    if (senderType === 'advisor' && isAiActive) {
      await this.redisState.removeAiActive(data.sessionId);
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

    if (await this.estaEnAlmuerzo(data.newAdvisorId)) {
      client.emit('transfer_error', {
        reason: 'El asesor está en pausa de almuerzo.',
      });
      return;
    }

    const session = await this.sessionsService.transfer(
      data.sessionId,
      data.newAdvisorId,
    );

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

    // Notify new advisor via Redis adapter room
    this.server.to(`advisor:${data.newAdvisorId}`).emit('session_assigned', {
      sessionId: data.sessionId,
      clientName: session.clientName,
    });

    this.server.to(data.sessionId).emit('advisor_joined', {
      name: session.advisor?.name ?? 'Nuevo asesor',
      profilePhotoUrl: session.advisor?.profilePhotoUrl ?? null,
    });
    client.leave(data.sessionId);

    const msg = await this.chatService.saveMessage(
      data.sessionId,
      `Has sido asignado al asesor ${session.advisor?.name ?? 'otro asesor'}`,
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
        await this.redisState.setAdvisorStatus(a.id, a.status);
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
    await this.redisState.removeFromQueue(sessionId);
    await this.redisState.deleteRateLimit(sessionId);
    await this.redisState.deleteSessionSocket(sessionId);
    await this.broadcastQueuePositions();
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
        await this.redisState.setAdvisorStatus(a.id, a.status);
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
    await this.redisState.removeFromQueue(sessionId);
    await this.redisState.deleteRateLimit(sessionId);
    await this.redisState.deleteSessionSocket(sessionId);
    await this.broadcastQueuePositions();
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
  async handleSetActive(
    @MessageBody() data: { sessionId: string; active: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    client.data.isActive = data.active;
    if (client.data.role === 'client') {
      await this.redisState.setClientPresence(data.sessionId, {
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

    await this.redisState.addAiActive(sessionId);
    this.server.to(sessionId).emit('ai_mode_changed', { active: true });
    client.emit('remit_ai_ok', { sessionId });

    const all = await this.chatService.getHistory(sessionId, 100);
    const lastClient = [...all]
      .reverse()
      .find((m) => m.senderType === 'client');
    if (lastClient) await this.respondWithAi(sessionId, lastClient.content);
  }

  @SubscribeMessage('deactivate_ai_mode')
  async handleDeactivateAi(
    @MessageBody() payload: string | { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (client.data.role !== 'advisor') return;
    const sessionId =
      typeof payload === 'string' ? payload : payload?.sessionId;
    if (!sessionId) return;
    await this.redisState.removeAiActive(sessionId);
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
        await this.redisState.removeAiActive(sessionId);
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

  private async arrancarTimerReconexion(
    sessionId: string,
    advisorId: string,
    advisorName: string,
  ): Promise<void> {
    const config = await this.configuracionService
      .getGlobal()
      .catch(() => null);
    if (!config) return;

    const total = config.asesorReconexionSeg;
    if (total <= 0) return;

    // Cancel existing inactivity timer if any
    this.cancelarTimerActivo(sessionId);

    const entry: TimerEntry = {
      tipo: 'reconnection',
      timeout: null,
      tick: null,
      elapsed: 0,
      iterCliente: 0,
      advisorId,
      settingUp: false,
      startTime: Date.now(),
      totalSecs: total,
    };
    this.timers.set(sessionId, entry);

    // Notify client
    this.server.to(sessionId).emit('session_interrupted', {
      sessionId,
      tiempoLimiteSeg: total,
      mensaje: config.asesorReconexionMsg,
    });

    const tick = () => {
      const realElapsed = Math.floor((Date.now() - entry.startTime) / 1000);
      entry.elapsed = realElapsed;
      if (realElapsed < total) {
        const nextDelay = 1000 - ((Date.now() - entry.startTime) % 1000);
        entry.tick = setTimeout(tick, nextDelay);
      }
    };
    entry.tick = setTimeout(tick, 1000);

    const remainingMs = total * 1000 - (Date.now() - entry.startTime);
    entry.timeout = setTimeout(
      async () => {
        const session = await this.sessionsService
          .findOne(sessionId)
          .catch(() => null);
        if (!session || session.status !== 'active') return;
        if (entry.tipo !== 'reconnection') return;

        this.cancelarTimerActivo(sessionId);

        // Send disconnect message
        const msg = await this.chatService.saveMessage(
          sessionId,
          config.asesorReconexionMsg,
          'advisor',
          'Sistema',
        );
        this.server.to(sessionId).emit('new_message', msg);

        // Reassign to another available advisor
        await this.sessionsService.unassignAdvisor(sessionId);
        this.server.emit('session_updated', {
          sessionId,
          status: 'waiting',
        });
        this.server.to(sessionId).emit('session_interrupted', {
          sessionId,
          tiempoLimiteSeg: 0,
          mensaje:
            'El asesor se desconectó. Buscando otro asesor disponible...',
        });

        // Try immediate assignment
        await this.assignPendingSessions();

        const updated = await this.sessionsService
          .findOne(sessionId)
          .catch(() => null);

        if (updated && updated.status === 'active' && updated.advisor) {
          const msg2 = await this.chatService.saveMessage(
            sessionId,
            `Fuiste asignado al asesor ${updated.advisor.name}`,
            'advisor',
            'Sistema',
          );
          this.server.to(sessionId).emit('new_message', msg2);
        } else {
          // No advisor available — send waiting message and retry every 5s
          this.server.to(sessionId).emit('session_interrupted', {
            sessionId,
            tiempoLimiteSeg: 30,
            mensaje:
              'Todos los asesores están ocupados. Te asignaremos uno en cuanto esté disponible.',
          });

          let retries = 0;
          const retryInterval = setInterval(async () => {
            retries++;
            if (retries > 6) {
              clearInterval(retryInterval);
              return;
            }
            await this.assignPendingSessions();
            const updated2 = await this.sessionsService
              .findOne(sessionId)
              .catch(() => null);
            if (updated2?.status === 'active' && updated2.advisor) {
              clearInterval(retryInterval);
              const msg3 = await this.chatService.saveMessage(
                sessionId,
                `Fuiste asignado al asesor ${updated2.advisor.name}`,
                'advisor',
                'Sistema',
              );
              this.server.to(sessionId).emit('new_message', msg3);
            }
          }, 5000);
        }

        // Cleanup
        if (advisorId) {
          const a = await this.sessionsService
            .findAdvisorById(advisorId)
            .catch(() => null);
          if (a) {
            await this.redisState.setAdvisorStatus(a.id, a.status);
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
        await this.redisState.removeFromQueue(sessionId);
        await this.redisState.deleteRateLimit(sessionId);
        await this.redisState.deleteSessionSocket(sessionId);
        await this.broadcastQueuePositions();
        await this.assignPendingSessions();

        this.logger.log(
          `[Reconexion] Sesión ${sessionId} reasignada por reconexión fallida del asesor`,
        );
      },
      Math.max(0, remainingMs),
    );
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

  private async assignWaitingWhatsappChats(): Promise<void> {
    const waIds = this.advisorsWhatsappService.getConnectedAdvisorIds();
    if (!waIds.length) return;
    await this.advisorsWhatsappService.assignWaitingChats(waIds);
  }

  private async assignPendingSessions(): Promise<void> {
    // Distributed lock: only one instance runs this at a time
    const locked = await this.redisState.acquireAssignLock(8000);
    if (!locked) return;
    try {
      const waiting = await this.sessionsService.findWaitingSessions();
      for (const session of waiting) {
        const connectedIds = await this.redisState.getConnectedAdvisorIds();
        const hasAvailable =
          await this.sessionsService.findAvailableAdvisorFromList(connectedIds);
        if (!hasAvailable) break;
        await this.autoAssignAdvisor(session.id, session.clientName);
      }
    } finally {
      await this.redisState.releaseAssignLock();
    }
  }

  private async autoAssignAdvisor(
    sessionId: string,
    clientName: string,
  ): Promise<boolean> {
    const session = await this.sessionsService.findOne(sessionId);
    if (session.status !== 'waiting') return false;

    const connectedIds = await this.redisState.getConnectedAdvisorIds();
    if (!connectedIds.length) return false;

    const disponiblesIds: string[] = [];
    for (const id of connectedIds) {
      if (!(await this.estaEnAlmuerzo(id))) {
        disponiblesIds.push(id);
      }
    }
    if (!disponiblesIds.length) {
      this.logger.log(
        '[Assign] Todos los asesores conectados están en almuerzo.',
      );
      return false;
    }

    const advisor =
      await this.sessionsService.findAvailableAdvisorFromList(disponiblesIds);
    if (!advisor) return false;

    if (await this.estaEnAlmuerzo(advisor.id)) {
      this.logger.log(
        `[Assign] Asesor ${advisor.name} está en almuerzo, salteando.`,
      );
      return false;
    }

    // Verify advisor is still connected
    const stillConnected = await this.redisState.getConnectedAdvisorIds();
    if (!stillConnected.includes(advisor.id)) {
      return false;
    }

    const assigned = await this.sessionsService.assignAdvisor(
      sessionId,
      advisor.id,
    );
    if (assigned.status !== 'active') return false;

    // Use Redis adapter room for cross-instance delivery
    this.server.to(`advisor:${advisor.id}`).emit('join_session', {
      sessionId,
      clientName,
    });
    this.server.to(sessionId).emit('advisor_joined', {
      name: advisor.name,
      profilePhotoUrl: advisor.profilePhotoUrl ?? null,
    });
    this.server.to(`advisor:${advisor.id}`).emit('session_assigned', {
      sessionId,
      clientName,
    });
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
      await this.redisState.setAdvisorStatus(
        refreshedAdvisor.id,
        refreshedAdvisor.status,
      );
      this.server.emit('advisor_status_changed', {
        advisorId: refreshedAdvisor.id,
        name: refreshedAdvisor.name,
        status: refreshedAdvisor.status,
        activeChats: refreshedAdvisor.activeChats,
        profilePhotoUrl: refreshedAdvisor.profilePhotoUrl ?? null,
      });
    }

    await this.redisState.removeFromQueue(sessionId);
    await this.redisState.deleteSessionSocket(sessionId);
    await this.broadcastQueuePositions();

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

    this.logger.log(
      `[Assign] ✓ ${sessionId} → ${advisor.name} (PID: ${process.pid})`,
    );
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

    const advisorIds = await this.redisState.getConnectedAdvisorIds();
    const configMap = await this.configuracionService
      .getEfectivaBatch(advisorIds)
      .catch(() => new Map());

    await Promise.all(
      advisorIds.map(async (advisorId) => {
        try {
          const config = configMap.get(advisorId);
          if (!config) return;

          const almuerzos: Array<{ dia: number; inicio: string; fin: string }> =
            config.almuerzos ?? [];

          const almuerzoHoy = almuerzos.find((a) => a.dia === diaSem);
          const enHorario = almuerzoHoy
            ? hhmm >= almuerzoHoy.inicio && hhmm < almuerzoHoy.fin
            : false;

          const enAlmuerzoActivo = await this.estaEnAlmuerzo(advisorId);
          const pendiente = await this.tieneAlmuerzoPendiente(advisorId);

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
              !(await this.redisState.isLunchNotified(advisorId))
            ) {
              await this.redisState.addLunchNotified(advisorId);
              const minsRest = Math.ceil(diffToStart / 60000);
              this.server.to(`advisor:${advisorId}`).emit('lunch_approaching', {
                mensaje: `Tu hora de almuerzo (${almuerzoHoy.inicio}) se acerca. Faltan ${minsRest} minuto(s).`,
                minutos: minsRest,
                inicio: almuerzoHoy.inicio,
              });
            } else if (diffToStart > cincoMinMs || diffToStart <= 0) {
              await this.redisState.removeLunchNotified(advisorId);
            }
          }

          // ENTRÓ al horario de almuerzo
          if (enHorario && !enAlmuerzoActivo && !pendiente) {
            await this.redisState.removeLunchNotified(advisorId);
            await this.sessionsService
              .setAdvisorStatus(advisorId, 'busy')
              .catch(() => null);
            await this.redisState.setAdvisorStatus(advisorId, 'busy');
            this.server.emit('advisor_status_changed', {
              advisorId,
              name: config.mensajeBienvenida, // will be overridden by advisor name from DB
              status: 'busy',
            });

            const [ih, im] = almuerzoHoy!.inicio.split(':').map(Number);
            const [fh, fm] = almuerzoHoy!.fin.split(':').map(Number);
            const duracionMs = (fh * 60 + fm - (ih * 60 + im)) * 60_000;

            const chatsActivos =
              await this.countChatsActivosAlmuerzo(advisorId);

            if (chatsActivos.total > 0) {
              await this.redisState.removeLunchNotified(advisorId);
              await this.redisState.setPendingLunch(advisorId, {
                inicioOriginal: almuerzoHoy!.inicio,
                finOriginal: almuerzoHoy!.fin,
                duracionMs,
                inicioReal: ahora.toISOString(),
              });
              this.server.to(`advisor:${advisorId}`).emit('lunch_pending', {
                mensaje: `Tienes ${chatsActivos.total} chat(s) activo(s). Termínalos para iniciar tu pausa de almuerzo.`,
                chats: chatsActivos.total,
                chatsWeb: chatsActivos.web,
                chatsWhatsapp: chatsActivos.whatsapp,
                inicio: almuerzoHoy!.inicio,
                finOriginal: almuerzoHoy!.fin,
              });
            } else {
              await this.redisState.removeLunchNotified(advisorId);
              await this.iniciarAlmuerzoAhora(
                advisorId,
                almuerzoHoy!.inicio,
                almuerzoHoy!.fin,
                duracionMs,
                ahora,
              );
            }
          }

          // SALIÓ del horario (fin natural)
          else if (!enHorario && enAlmuerzoActivo) {
            const finAjustado = await this.redisState.getOnLunch(advisorId);
            if (finAjustado) {
              const [h, m] = finAjustado.split(':').map(Number);
              const finAjMs = new Date(ahora).setHours(h, m, 0, 0);

              if (ahora.getTime() >= finAjMs) {
                await this.terminarAlmuerzo(advisorId);
              }
            }
          }

          // Salió del horario antes de aprobar pendiente
          else if (pendiente && !enHorario) {
            const pendData = await this.redisState.getPendingLunch(advisorId);
            if (pendData && hhmm >= pendData.finOriginal) {
              await this.redisState.removePendingLunch(advisorId);
              await this.sessionsService
                .setAdvisorStatus(advisorId, 'online')
                .catch(() => null);
              await this.redisState.setAdvisorStatus(advisorId, 'online');
              this.server.emit('advisor_status_changed', {
                advisorId,
                status: 'online',
              });
              this.server
                .to(`advisor:${advisorId}`)
                .emit('lunch_pending_cancelled');
              this.logger.log(
                `[Almuerzo] ❌ ${advisorId} horario de almuerzo expiró (tenía chats activos)`,
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
    inicioOriginal: string,
    finOriginal: string,
    duracionMs: number,
    inicioReal: Date,
  ): Promise<void> {
    const finAjMs = inicioReal.getTime() + duracionMs;
    const finAjDate = new Date(finAjMs);
    const finAjHora = `${String(finAjDate.getHours()).padStart(2, '0')}:${String(finAjDate.getMinutes()).padStart(2, '0')}`;

    await this.redisState.setOnLunch(advisorId, finAjHora);
    await this.redisState.removePendingLunch(advisorId);

    const ahora = new Date();
    const diffMs = Math.max(0, finAjMs - ahora.getTime());
    const restMins = Math.floor(diffMs / 60000);
    const restSegs = Math.floor((diffMs % 60000) / 1000);
    const restante = `${String(restMins).padStart(2, '0')}:${String(restSegs).padStart(2, '0')}`;

    this.server.to(`advisor:${advisorId}`).emit('lunch_started', {
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
      `[Almuerzo] 🍽️  ${advisorId} almuerzo hasta ${finAjHora}${ajuste} (PID: ${process.pid})`,
    );
  }

  private async terminarAlmuerzo(advisorId: string): Promise<void> {
    await this.redisState.removeOnLunch(advisorId);
    await this.sessionsService
      .setAdvisorStatus(advisorId, 'online')
      .catch(() => null);
    await this.redisState.setAdvisorStatus(advisorId, 'online');
    this.server.emit('advisor_status_changed', {
      advisorId,
      status: 'online',
    });
    this.server.to(`advisor:${advisorId}`).emit('lunch_ended');
    this.logger.log(
      `[Almuerzo] ✅ ${advisorId} volvió del almuerzo (PID: ${process.pid})`,
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
    const pendiente = await this.redisState.getPendingLunch(advisorId);
    if (!pendiente) return;

    const chatsActivos = await this.countChatsActivosAlmuerzo(advisorId);
    if (chatsActivos.total > 0) return;

    // Check if advisor is still connected
    const connected = await this.redisState.getConnectedAdvisorIds();
    if (!connected.includes(advisorId)) {
      await this.redisState.removePendingLunch(advisorId);
      return;
    }

    const ahora = new Date();
    await this.iniciarAlmuerzoAhora(
      advisorId,
      pendiente.inicioOriginal,
      pendiente.finOriginal,
      pendiente.duracionMs,
      ahora,
    );
  }

  private async estaEnAlmuerzo(advisorId: string): Promise<boolean> {
    return this.redisState.isOnLunch(advisorId);
  }

  private async tieneAlmuerzoPendiente(advisorId: string): Promise<boolean> {
    return this.redisState.isPendingLunch(advisorId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COLA DE ESPERA (Redis-backed)
  // ══════════════════════════════════════════════════════════════════════════

  private async emitQueuePosition(sessionId: string): Promise<void> {
    const pos = await this.redisState.getQueuePosition(sessionId);
    if (pos === -1) return;
    const socketId = await this.redisState.getSessionSocket(sessionId);
    if (!socketId) return;
    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('queue_position', {
        position: pos,
        total: await this.redisState.getQueueLength(),
      });
    }
  }

  private async broadcastQueuePositions(): Promise<void> {
    const queue = await this.redisState.getQueue();
    const total = queue.length;
    await Promise.all(
      queue.map(async (sessionId, index) => {
        const socketId = await this.redisState.getSessionSocket(sessionId);
        if (!socketId) return;
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('queue_position', {
            position: index,
            total,
          });
        }
      }),
    );
  }
}
