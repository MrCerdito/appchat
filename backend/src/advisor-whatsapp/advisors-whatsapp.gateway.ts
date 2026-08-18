import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import {
  AdvisorsWhatsappService,
  AssignmentResult,
  IncomingHandlingResult,
} from './advisors-whatsapp.service';

@WebSocketGateway({
  namespace: '/advisors-whatsapp',
  maxHttpBufferSize: 1_000_000,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class AdvisorsWhatsappGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdvisorsWhatsappGateway.name);
  private readonly advisorSockets = new Map<string, Set<string>>();
  private readonly subscriptions = new Subscription();
  private readonly queueDrainIntervalMs = 45_000;
  private queueDrainTimer: ReturnType<typeof setInterval> | null = null;
  private queueDraining = false;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly whatsappService: AdvisorsWhatsappService,
  ) {}

  onModuleInit() {
    this.subscriptions.add(
      this.whatsappService.incomingResults$.subscribe((result) =>
        this.emitIncoming(result),
      ),
    );
    this.subscriptions.add(
      this.whatsappService.messageStatusUpdates$.subscribe((updated) => {
        this.emitStatus(updated.advisorId, {
          messageId: updated.message.id,
          status: updated.message.status,
          chatId: updated.chat.id,
        });
      }),
    );
    this.subscriptions.add(
      this.whatsappService.connectionUpdates$.subscribe((update) => {
        this.server?.emit('aw_connection_update', update);
      }),
    );
    this.queueDrainTimer = setInterval(
      () => void this.drainWaitingQueue(),
      this.queueDrainIntervalMs,
    );
  }

  onModuleDestroy() {
    if (this.queueDrainTimer) clearInterval(this.queueDrainTimer);
    this.subscriptions.unsubscribe();
  }

  private async drainWaitingQueue(): Promise<void> {
    if (this.queueDraining) return;
    const connected = this.getConnectedAdvisorIds();
    if (!connected.length) return;
    this.queueDraining = true;
    try {
      const assignments = await this.whatsappService.assignWaitingChats(
        connected,
      );
      this.emitAssignments(assignments);
    } catch (err) {
      this.logger.warn(
        `Error drenando cola: ${err?.message ?? err}`,
      );
    } finally {
      this.queueDraining = false;
    }
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const secret = this.config.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      if (payload.role !== 'advisor' && payload.role !== 'admin') {
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        role: payload.role,
      };
      client.join(this.advisorRoom(payload.sub));
      if (payload.role === 'admin') {
        client.join('admins');
      }
      this.addAdvisorSocket(payload.sub, client.id);
      this.whatsappService.setConnectedAdvisorIds(
        this.getConnectedAdvisorIds(),
      );

      client.emit('aw_connected', { advisorId: payload.sub });

      this.logger.log(`Asesor WhatsApp conectado: ${payload.name}`);

      this.server.emit('aw_advisors_online', {
        advisorIds: this.getConnectedAdvisorIds(),
      });

      try {
        client.emit(
          'aw_connection_update',
          await this.whatsappService.getConnectionStatus(),
        );
      } catch (err) {
        this.logger.warn(
          `Error obteniendo estado WhatsApp para ${payload.name}: ${err?.message ?? err}`,
        );
      }

      try {
        const assignments = await this.whatsappService.assignWaitingChats(
          this.getConnectedAdvisorIds(),
        );
        this.emitAssignments(assignments);
      } catch (err) {
        this.logger.warn(
          `Error asignando chats en espera para ${payload.name}: ${err?.message ?? err}`,
        );
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const advisorId = client.data.user?.id;
    if (!advisorId) return;

    this.whatsappService.closeChatView(advisorId);

    const wentOffline = this.removeAdvisorSocket(advisorId, client.id);
    if (!wentOffline) return;
    this.whatsappService.setConnectedAdvisorIds(this.getConnectedAdvisorIds());

    this.server.emit('aw_advisors_online', {
      advisorIds: this.getConnectedAdvisorIds(),
    });

    this.logger.log(
      `Asesor WhatsApp desconectado: ${advisorId}. Sus chats asignados se conservan.`,
    );
  }

  @SubscribeMessage('aw_open_chat')
  async handleOpenChat(
    @MessageBody() chatId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (!user || !chatId || typeof chatId !== 'string') return;
    try {
      const chat = await this.whatsappService.openChat(
        chatId,
        user.id,
        user.role,
      );
      this.emitChatUpdated(chat);
    } catch (err) {
      this.logger.warn(
        `Error marcando chat abierto para ${user.id}: ${err?.message ?? err}`,
      );
    }
  }

  @SubscribeMessage('aw_close_chat')
  handleCloseChat(@ConnectedSocket() client: Socket) {
    const user = client.data.user;
    if (!user) return;
    this.whatsappService.closeChatView(user.id);
  }

  @SubscribeMessage('aw_join')
  async handleJoin(
    @MessageBody() advisorId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (
      client.data.user?.id !== advisorId &&
      client.data.user?.role !== 'admin'
    )
      return;
    client.join(this.advisorRoom(advisorId));
    this.whatsappService.closeChatView(advisorId);

    try {
      const assignments = await this.whatsappService.assignWaitingChats(
        this.getConnectedAdvisorIds(),
      );
      this.emitAssignments(assignments);
    } catch (err) {
      this.logger.warn(
        `Error asignando chats en espera en aw_join: ${err?.message ?? err}`,
      );
    }
  }

  getConnectedAdvisorIds(): string[] {
    return [...this.advisorSockets.keys()];
  }

  emitIncoming(result: IncomingHandlingResult) {
    if (result.duplicate) return;

    if (result.assignment) {
      if (result.message) {
        this.emitToAdvisor(
          result.assignment.advisorId,
          'aw_new_message',
          result.message,
        );
        this.emitToAdmins('aw_new_message', result.message);
      }
      this.emitAssignments([result.assignment]);
      return;
    }

    if (result.assignedAdvisorId) {
      if (result.message) {
        this.emitToAdvisor(
          result.assignedAdvisorId,
          'aw_new_message',
          result.message,
        );
        this.emitToAdmins('aw_new_message', result.message);
      }
      this.emitToAdvisor(
        result.assignedAdvisorId,
        'aw_chat_updated',
        result.chat,
      );
      this.emitToAdmins('aw_chat_updated', result.chat);
      return;
    }

    // Chat sin asesor asignado: permanece en la cola, visible para todos.
    this.server.emit('aw_chat_updated', result.chat);
    if (result.message) {
      this.server.emit('aw_new_message', result.message);
    }
    if (result.queueMessage) {
      this.server.emit('aw_new_message', result.queueMessage);
    }
    if (!result.chat.isGroup) {
      this.server.emit('aw_queue_updated', { chat: result.chat });
    }
  }

  emitAssignments(assignments: AssignmentResult[]) {
    for (const assignment of assignments) {
      this.emitToAdvisor(assignment.advisorId, 'aw_chat_assigned', {
        advisorId: assignment.advisorId,
        advisorName: assignment.advisorName,
        chat: assignment.chat,
      });
      this.emitToAdvisor(
        assignment.advisorId,
        'aw_chat_updated',
        assignment.chat,
      );
      this.emitToAdmins('aw_chat_updated', assignment.chat);
      if (assignment.autoMessage) {
        this.emitToAdvisor(
          assignment.advisorId,
          'aw_new_message',
          assignment.autoMessage,
        );
        this.emitToAdmins('aw_new_message', assignment.autoMessage);
      }
    }
    if (assignments.length) {
      this.server.emit('aw_queue_updated', {});
    }
  }

  emitStatus(
    advisorId: string | undefined,
    payload: { messageId: string; status: string; chatId?: string },
  ) {
    if (advisorId) {
      this.emitToAdvisor(advisorId, 'aw_message_status', payload);
      this.emitToAdmins('aw_message_status', payload);
    } else {
      this.server.emit('aw_message_status', payload);
    }
  }

  emitChatUpdated(chat: unknown) {
    const anyChat = chat as {
      assignedTo?: string;
      assignedAdvisor?: { id?: string };
    };
    const advisorId = anyChat?.assignedTo ?? anyChat?.assignedAdvisor?.id;
    if (advisorId) {
      this.emitToAdvisor(advisorId, 'aw_chat_updated', chat);
      this.emitToAdmins('aw_chat_updated', chat);
    } else {
      // Chat sin asesor (cola) — visible para todos.
      this.server.emit('aw_chat_updated', chat);
    }
  }

  emitAdminDashboard(payload: unknown) {
    this.server?.to('admins').emit('aw_admin_dashboard', payload);
  }

  private emitToAdvisor(advisorId: string, event: string, payload: unknown) {
    this.server.to(this.advisorRoom(advisorId)).emit(event, payload);
  }

  private emitToAdmins(event: string, payload: unknown) {
    this.server.to('admins').emit(event, payload);
  }

  private advisorRoom(advisorId: string) {
    return `advisor:${advisorId}`;
  }

  private addAdvisorSocket(advisorId: string, socketId: string) {
    const sockets = this.advisorSockets.get(advisorId) ?? new Set<string>();
    sockets.add(socketId);
    this.advisorSockets.set(advisorId, sockets);
  }

  private removeAdvisorSocket(advisorId: string, socketId: string): boolean {
    const sockets = this.advisorSockets.get(advisorId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size > 0) return false;
    this.advisorSockets.delete(advisorId);
    return true;
  }
}
