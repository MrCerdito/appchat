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
export class TicketsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ??
        (client.handshake.headers?.authorization?.replace('Bearer ', '') ?? '');

      // Sin token el socket puede ser legítimamente un cliente anónimo del
      // widget (chat). Este gateway comparte el namespace raíz con el chat:
      // NO hay que desconectarlo, solo no volverlo parte de 'tickets-room'.
      if (!token) return;

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub ?? payload.id;
      if (!userId) { client.disconnect(); return; }

      (client as any).userId = userId;
      client.join('tickets-room');
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket): void {}

  broadcastTicketEvent(event: string, data: any): void {
    this.server?.to('tickets-room').emit(event, data);
  }
}
