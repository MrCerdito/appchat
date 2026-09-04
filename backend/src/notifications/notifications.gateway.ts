import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4200', 'http://localhost:3001'],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ??
        (client.handshake.headers?.authorization?.replace('Bearer ', '') ?? '');

      // Sin token puede ser un cliente anónimo del widget (chat) en el mismo
      // namespace raíz: no se desconecta, solo no entra a 'user:{id}'.
      if (!token) return;

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub ?? payload.id;
      if (!userId) {
        client.disconnect();
        return;
      }

      (client as any).userId = userId;
      client.join(`user:${userId}`);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      this.logger.debug(`Notifications WS connected: ${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client as any).userId as string | undefined;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    }
  }

  sendToUser(userId: string, notification: any): void {
    this.server?.to(`user:${userId}`).emit('notification', notification);
  }

  sendToUsers(userIds: string[], notification: any): void {
    for (const userId of userIds) {
      this.sendToUser(userId, notification);
    }
  }
}
