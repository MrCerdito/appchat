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

/** Sala con los eventos de tickets. Solo entra quien tenga el permiso `tickets`. */
const SALA_TICKETS = 'tickets-room';

/**
 * TTL del cache de permisos por socket.
 *
 * `permisoActivo` hace varias consultas a BD (modulos del rol, defaults y el
 * override del usuario). Resolverlo en cada reconexion seria castigar a la base
 * de datos sin motivo, porque un permiso cambia como mucho una vez cada varios
 * meses. El TTL acota la ventana de desfase si se revoca un acceso.
 */
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
export class TicketsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketsGateway.name);
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

      // Sin token el socket puede ser legítimamente un cliente anónimo del
      // widget (chat). Este gateway comparte el namespace raíz con el chat:
      // NO hay que desconectarlo, solo no volverlo parte de 'tickets-room'.
      if (!token) return;

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub ?? payload.id;
      if (!userId) {
        client.disconnect();
        return;
      }

      const user = {
        id: String(userId),
        role: String(payload.role ?? ''),
      };

      (client as any).userId = user.id;
      (client as any).role = user.role;

      // Misma comprobacion que hace PermisoModuloGuard en el REST. Sin esto,
      // cualquier JWT valido recibia ticket:created/updated/deleted de TODOS los
      // tickets de la plataforma, incluidos los clientInfo con datos personales.
      // Si no tiene permiso se queda conectado (el namespace es compartido con el
      // chat) pero fuera de la sala, de modo que no le llega ningun evento.
      if (!(await this.tienePermisoTickets(user))) {
        this.logger.debug(
          `Socket de ${user.id} (${user.role || 'sin rol'}) sin permiso 'tickets': no entra a ${SALA_TICKETS}.`,
        );
        return;
      }

      client.join(SALA_TICKETS);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client as any).userId as string | undefined;
    if (userId) {
      client.leave(SALA_TICKETS);
      this.cachePermisos.delete(userId);
    }
  }

  /**
   * `superadmin` y los overrides por usuario se resuelven igual que en HTTP a
   * traves de AccesosService, para que websocket y REST no se comporten distinto.
   */
  private async tienePermisoTickets(user: {
    id: string;
    role: string;
  }): Promise<boolean> {
    const cache = this.cachePermisos.get(user.id);
    if (cache && cache.exp > Date.now()) return cache.permitido;

    let permitido = false;
    try {
      permitido = await this.accesos.permisoActivo(user, 'tickets');
    } catch (err: any) {
      // Ante un fallo de base de datos se denies el acceso: es preferible que un
      // usuario no reciba eventos en ese momento a que se los reciba sin permiso.
      this.logger.error(
        `No se pudo verificar el permiso 'tickets' de ${user.id}: ${err?.message ?? err}`,
      );
      permitido = false;
    }

    this.cachePermisos.set(user.id, {
      permitido,
      exp: Date.now() + TTL_PERMISO_MS,
    });
    return permitido;
  }

  broadcastTicketEvent(event: string, data: any): void {
    this.server?.to(SALA_TICKETS).emit(event, data);
  }
}