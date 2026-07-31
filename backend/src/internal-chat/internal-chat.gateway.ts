import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { InternalChatService } from './internal-chat.service';

@WebSocketGateway({
  namespace: '/internal-chat',
  maxHttpBufferSize: 1_000_000,
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4200'],
    credentials: true,
  },
})
export class InternalChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(InternalChatGateway.name);
  private readonly advisorSockets = new Map<string, Set<string>>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly internalChatService: InternalChatService,
  ) {}

  onModuleInit() {
    this.subscriptions.add(
      this.internalChatService.newMessages$.subscribe(({ conversationId, message, memberIds }) => {
        for (const memberId of memberIds) {
          this.server?.to(this.advisorRoom(memberId)).emit('ic_new_message', {
            conversationId,
            message,
          });
        }
      }),
    );
    this.subscriptions.add(
      this.internalChatService.messageEdited$.subscribe(({ conversationId, message, memberIds }) => {
        for (const memberId of memberIds) {
          this.server?.to(this.advisorRoom(memberId)).emit('ic_message_edited', {
            conversationId,
            message,
          });
        }
      }),
    );
    this.subscriptions.add(
      this.internalChatService.messageDeleted$.subscribe(({ conversationId, messageId, deletedAt, memberIds }) => {
        for (const memberId of memberIds) {
          this.server?.to(this.advisorRoom(memberId)).emit('ic_message_deleted', {
            conversationId,
            messageId,
            deletedAt,
          });
        }
      }),
    );
    this.subscriptions.add(
      this.internalChatService.reactionUpdated$.subscribe(({ reaction, memberIds }) => {
        for (const memberId of memberIds) {
          this.server?.to(this.advisorRoom(memberId)).emit('ic_reaction', reaction);
        }
      }),
    );
    this.subscriptions.add(
      this.internalChatService.conversationUpdates$.subscribe(({ conversation, memberIds }) => {
        for (const memberId of memberIds) {
          this.server?.to(this.advisorRoom(memberId)).emit('ic_conversation_updated', conversation);
        }
      }),
    );
    this.subscriptions.add(
      this.internalChatService.unreadUpdates$.subscribe(({ conversationId, userId, unreadCount }) => {
        this.server?.to(this.advisorRoom(userId)).emit('ic_unread', {
          conversationId,
          unreadCount,
        });
      }),
    );
  }

  onModuleDestroy() {
    this.subscriptions.unsubscribe();
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
      this.addAdvisorSocket(payload.sub, client.id);
      client.emit('ic_connected', { userId: payload.sub });
      this.logger.log(`Asesor conectado al chat interno: ${payload.name}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user as { id?: string } | undefined;
    if (user?.id) {
      this.removeAdvisorSocket(user.id, client.id);
    }
  }

  private advisorRoom(advisorId: string): string {
    return `advisor:${advisorId}`;
  }

  private addAdvisorSocket(advisorId: string, socketId: string): void {
    const set = this.advisorSockets.get(advisorId) ?? new Set<string>();
    set.add(socketId);
    this.advisorSockets.set(advisorId, set);
  }

  private removeAdvisorSocket(advisorId: string, socketId: string): void {
    const set = this.advisorSockets.get(advisorId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
      this.advisorSockets.delete(advisorId);
    }
  }
}
