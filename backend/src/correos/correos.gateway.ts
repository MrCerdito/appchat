import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

/** Evento que el frontend de Correos escucha para refrescar su lista. */
export const EVENTO_CORREO_ACTUALIZADO = 'correo:actualizado';

/**
 * Evento que el tablero de SLA del admin escucha para recargarse solo.
 *
 * Se emite una vez por tic del sincronizador, y solo si algo cambio de verdad:
 * asi el tablero se actualiza solo en cuanto el espejo local refleja un cambio
 * de Outlook, sin que el admin tenga que pedirlo ni recargar la pagina.
 */
export const EVENTO_SLA_CORREOS = 'correo:sla';

/** Sala de los admins conectados. Un unico destino para todos los tableros. */
export const SALA_ADMIN_SLA = 'sla:admin';

export interface EventoSlaCorreos {
  /** Pasada del sincronizador que disparo el aviso. */
  tick: number;
  /** Correos nuevos detectados en esta pasada, summed over all advisors. */
  nuevos: number;
  /** Correos ya conocidos cuyo contenido cambio. */
  actualizados: number;
  /** Correos que salieron de alguna carpeta. */
  eliminados: number;
}

export interface EventoCorreoActualizado {
  /** Correos nuevos detectados en esta pasada del sincronizador. */
  nuevos: number;
  /** Correos ya conocidos cuyo contenido cambio (leido, categoria, etc.). */
  actualizados: number;
  /** Correos que salieron de la carpeta. */
  eliminados: number;
  /** Nombre de la carpeta del asesor, para el mensaje del aviso. */
  carpeta: string;
  /** True si al menos uno de los nuevos es no leido. */
  hayNoLeidos: boolean;
}

/**
 * Gateway del modulo de Correos.
 *
 * Vive en el namespace raiz (igual que NotificationsGateway, TareasGateway y
 * TicketsGateway) para que el `SocketService` compartido del frontend lo use sin
 * abrir una conexion extra: el asesor ya tiene ese socket abierto desde el
 * dashboard.
 *
 * Solo se une a la sala `user:{id}`, nunca a una sala por identificador suelto:
 * el socket se une aqui en `handleConnection`, que es lo que hace que el evento
 * llegue a alguien.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4200', 'http://localhost:3001'],
    credentials: true,
  },
})
export class CorreosGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CorreosGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ??
        client.handshake.headers?.authorization?.replace('Bearer ', '') ??
        '';

      // Sin token puede ser el cliente anonimo del widget de chat en el mismo
      // namespace raiz: se deja conectado, pero sin entrar a `user:{id}`.
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

      // Los admins tambien entran a la sala del tablero de SLA. Es una decision
      // de servidor, no del cliente: que entre un admin a este socket no le da
      // ningun dato nuevo, solo le habilita recibir el empujon de recarga.
      const rol = payload.role;
      if (rol === 'admin' || rol === 'superadmin') {
        client.join(SALA_ADMIN_SLA);
        this.logger.debug(`Correos WS admin en sala SLA: ${userId}`);
      }

      this.logger.debug(`Correos WS conectado: ${userId}`);
    } catch {
      // Token invalido o expirado: el cliente se reconecta solo con el token
      // bueno. No se desconecta al widget, que nunca manda token.
    }
  }

  /**
   * Avisa a un asesor de que su carpeta cambio. El frontend lo usa para
   * recargar la lista sin pedir un cronometro de recarga.
   */
  enviarCambio(asesorId: string, payload: EventoCorreoActualizado): void {
    this.server?.to(`user:${asesorId}`).emit(EVENTO_CORREO_ACTUALIZADO, payload);
  }

  /**
   * Avisa a todos los tableros de SLA abiertos que el espejo local cambio.
   *
   * Es lo que hace que el tablero sea "en tiempo real": el sincronizador es el
   * unico que sabe cuando los datos cambian, asi que en vez de que el admin
   * presione "Actualizar" y espere, es el servidor quien dice "ya hay novelty" y
   * el tablero se recarga solo. El evento solo lleva un resumen: el tablero
   * vuelve a pedir `resumen` por HTTP, que ya es una consulta local rapida.
   */
  avisarSla(payload: EventoSlaCorreos): void {
    this.server?.to(SALA_ADMIN_SLA).emit(EVENTO_SLA_CORREOS, payload);
  }
}