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
import { AccesosService } from '../accesos/accesos.service';

/**
 * Sala del workspace de tareas.
 *
 * Deliberadamente separada de `tickets-room`: las tareas son internas y solo
 * las ven desarrolladores y administradores con el permiso `tareas`. El
 * tracker publico tampoco entra aqui.
 */
const SALA_TAREAS = 'tareas-room';

/** Ver la nota de TTL en TicketsGateway: mismo razonamiento. */
const TTL_PERMISO_MS = 60_000;

interface CachePermiso {
  permitido: boolean;
  exp: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4200', 'http://localhost:3001'],
    credentials: true,
  },
})
export class TareasGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TareasGateway.name);
  private readonly cachePermisos = new Map<string, CachePermiso>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly accesos: AccesosService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ??
        client.handshake.headers?.authorization?.replace('Bearer ', '') ??
        '';

      // El namespace raiz lo comparte el widget publico del chat, asi que un
      // cliente sin token no se desconecta: simplemente nunca entra a la sala.
      if (!token) return;

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub ?? payload.id;
      if (!userId) {
        client.disconnect();
        return;
      }

      (client as any).userId = String(userId);
      (client as any).role = String(payload.role ?? '');

      if (!(await this.tienePermisoTareas({ id: String(userId), role: String(payload.role ?? '') }))) {
        this.logger.debug(
          `Socket de ${userId} (${payload.role || 'sin rol'}) sin permiso 'tareas': no entra a ${SALA_TAREAS}.`,
        );
        return;
      }

      client.join(SALA_TAREAS);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client as any).userId as string | undefined;
    if (userId) {
      client.leave(SALA_TAREAS);
      this.cachePermisos.delete(userId);
    }
  }

  private async tienePermisoTareas(user: { id: string; role: string }): Promise<boolean> {
    const cache = this.cachePermisos.get(user.id);
    if (cache && cache.exp > Date.now()) return cache.permitido;

    let permitido = false;
    try {
      permitido = await this.accesos.permisoActivo(user, 'tareas');
    } catch (err: any) {
      // Deny por defecto: preferimos perder un evento a filtrar uno.
      this.logger.error(
        `No se pudo verificar el permiso 'tareas' de ${user.id}: ${err?.message ?? err}`,
      );
      permitido = false;
    }

    this.cachePermisos.set(user.id, { permitido, exp: Date.now() + TTL_PERMISO_MS });
    return permitido;
  }

  broadcastTareaEvent(event: string, data: any): void {
    this.server?.to(SALA_TAREAS).emit(event, data);
  }

  /** Aviso dirigido: el comentario solo le interesa a quien lleva la tarea. */
  sendToUser(userId: string, event: string, data: any): void {
    this.server?.to(userId).emit(event, data);
  }
}