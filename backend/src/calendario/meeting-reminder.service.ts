import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TeamsMeeting } from '../advisor-whatsapp/entities/teams-meeting.entity';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;
const DUE_WINDOW_PADDING_MS = 10 * 1000;
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Recuerda cada reunión de Teams al creador; las de equipo se anuncian a todos los asesores. */
@Injectable()
export class MeetingReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingReminderService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private revisando = false;

  constructor(
    @InjectRepository(TeamsMeeting)
    private readonly meetings: Repository<TeamsMeeting>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Producción no ejecuta synchronize; añade la columna idempotentemente
      // para conservar la categoría elegida al crear la reunión.
      await this.dataSource.query(
        `ALTER TABLE teams_meetings
         ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}'::text[]`,
      );
    } catch (error: any) {
      this.logger.error(`No se pudo preparar la categoría para recordatorios: ${error?.message ?? error}`);
      return;
    }

    this.interval = setInterval(() => void this.revisar(), POLL_INTERVAL_MS);
    this.interval.unref?.();
    void this.revisar();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async revisar(ahora = new Date()): Promise<void> {
    if (this.revisando) return;
    this.revisando = true;
    try {
      await this.procesarRecordatorios(ahora);
    } catch (error: any) {
      this.logger.warn(`No se pudieron revisar recordatorios de reuniones: ${error?.message ?? error}`);
    } finally {
      this.revisando = false;
    }
  }

  /** Se deja accesible para probar la ventana de cinco minutos con un reloj controlado. */
  async procesarRecordatorios(ahora = new Date()): Promise<void> {
    const desde = new Date(ahora.getTime() + FIVE_MINUTES_MS - DUE_WINDOW_PADDING_MS);
    const hasta = new Date(ahora.getTime() + FIVE_MINUTES_MS + DUE_WINDOW_PADDING_MS);
    const reuniones = await this.meetings.find({
      where: { startDateTime: Between(desde, hasta) },
      order: { startDateTime: 'ASC' },
    });
    const candidatas = reuniones.filter((reunion) => reunion.createdBy && reunion.joinUrl?.trim());
    if (!candidatas.length) return;

    const asesores = await this.users.find({
      where: { active: true, role: 'advisor' },
      select: ['id'],
    });
    const idsAsesores = asesores.map((asesor) => asesor.id);

    for (const reunion of candidatas) {
      const esEquipo = esReunionDeEquipo(reunion.categories ?? []);
      const destinatarios = esEquipo ? idsAsesores : [reunion.createdBy as string];
      const fecha = new Date(reunion.startDateTime.getTime() + BOGOTA_OFFSET_MS)
        .toISOString()
        .slice(0, 10);
      const hora = new Intl.DateTimeFormat('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Bogota',
      }).format(reunion.startDateTime);

      for (const recipientId of destinatarios) {
        await this.notifications.create({
          recipientId,
          type: 'reunion_recordatorio',
          title: esEquipo ? 'Reunión de equipo en 5 minutos' : 'Tu reunión empieza en 5 minutos',
          message: `${reunion.subject} · ${hora}`,
          entityType: 'meeting',
          entityId: reunion.id,
          meta: {
            meetingId: reunion.id,
            eventId: reunion.eventId,
            subject: reunion.subject,
            startDateTime: reunion.startDateTime.toISOString(),
            endDateTime: reunion.endDateTime.toISOString(),
            joinUrl: reunion.joinUrl,
            fecha,
            categoria: esEquipo ? 'Reunion equipo' : null,
          },
        });
      }
    }
  }
}

function esReunionDeEquipo(categorias: string[]): boolean {
  return categorias.some((categoria) => {
    const clave = categoria.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return clave === 'reunion equipo' || clave === 'purple category';
  });
}
