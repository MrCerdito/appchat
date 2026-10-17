import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarioGrupoService } from './calendario-grupo.service';
import { EventoCalendarioDto } from './dto/calendario-grupo.dto';

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const INTERVALO_REVISION_MS = 5 * 60 * 1000;
const INICIO_JORNADA = 8;
const FIN_JORNADA = 17;

/** Publica en la campanita los cumpleaños cercanos durante la jornada laboral. */
@Injectable()
export class CumpleanosNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CumpleanosNotificationsService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private revisando = false;
  private ultimoDiaCompletado = '';

  constructor(
    private readonly calendario: CalendarioGrupoService,
    private readonly notifications: NotificationsService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.revisar(), INTERVALO_REVISION_MS);
    this.interval.unref?.();
    void this.revisar();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async revisar(ahora = new Date()): Promise<void> {
    const ahoraBogota = new Date(ahora.getTime() + BOGOTA_OFFSET_MS);
    const diaHoy = claveDia(ahoraBogota);
    const diaSemana = ahoraBogota.getUTCDay();
    const hora = ahoraBogota.getUTCHours();
    const esLaboral = diaSemana >= 1 && diaSemana <= 5 && hora >= INICIO_JORNADA && hora < FIN_JORNADA;
    if (!esLaboral || this.revisando || this.ultimoDiaCompletado === diaHoy) return;

    this.revisando = true;
    try {
      await this.procesarCumpleanos(ahoraBogota);
      this.ultimoDiaCompletado = diaHoy;
    } catch (error: any) {
      this.logger.warn(`No se pudieron revisar cumpleaños del calendario: ${error?.message ?? error}`);
    } finally {
      this.revisando = false;
    }
  }

  /** Se deja público para poder verificar el trabajo diario con fechas controladas. */
  async procesarCumpleanos(ahoraBogota: Date): Promise<void> {
    const hoy = claveDia(ahoraBogota);
    // Graph recibe el rango UTC equivalente a medianoche de Bogotá: revisamos
    // los siguientes tres días para desplazar a viernes los cumpleaños del fin
    // de semana o del lunes.
    const desde = new Date(Date.UTC(
      ahoraBogota.getUTCFullYear(), ahoraBogota.getUTCMonth(), ahoraBogota.getUTCDate() + 1, 5,
    ));
    const hasta = new Date(Date.UTC(
      ahoraBogota.getUTCFullYear(), ahoraBogota.getUTCMonth(), ahoraBogota.getUTCDate() + 4, 5,
    ));
    const calendario = await this.calendario.obtener(desde.toISOString(), hasta.toISOString());
    const cumpleanos = calendario.eventos
      .filter((evento) => esCumpleanos(evento) && !evento.isCancelled)
      .map((evento) => ({ evento, fecha: fechaEventoBogota(evento.startDateTime) }))
      .filter(({ fecha }) => {
        const diasHasta = diferenciaDias(hoy, fecha);
        return diasHasta >= 1 && diasHasta <= 3 && diaAvisoLaboral(fecha) === hoy;
      });

    if (!cumpleanos.length) return;

    const asesores = await this.users.find({
      where: { active: true, role: 'advisor' },
      select: ['id'],
    });
    if (!asesores.length) return;

    for (const { evento, fecha } of cumpleanos) {
      const persona = nombreCumpleanero(evento.subject);
      const diasHasta = diferenciaDias(hoy, fecha);
      const cuando = diasHasta === 1 ? 'Mañana' : `El ${nombreDia(fecha)}`;
      const titulo = `${cuando} cumple ${persona}`.slice(0, 255);
      const eventNotificationId = idAvisoCumpleanos(evento.eventId, fecha);

      for (const asesor of asesores) {
        await this.notifications.create({
          recipientId: asesor.id,
          type: 'cumpleanos_recordatorio',
          title: titulo,
          message: `Cumpleaños en el calendario del equipo · ${fechaLarga(fecha)}.`,
          entityType: 'calendario',
          entityId: eventNotificationId,
          meta: {
            eventId: evento.eventId,
            fecha,
            tipoEvento: 'cumpleanos',
            nombre: persona,
          },
        });
      }
    }
  }
}

function esCumpleanos(evento: EventoCalendarioDto): boolean {
  const categorias = (evento.categorias ?? []).map(normalizar);
  const asunto = normalizar(evento.subject);
  return categorias.some((categoria) =>
    categoria === 'cumpleanos' || categoria === 'green category' || categoria === 'birthday',
  ) || asunto.includes('cumpleanos') || asunto.includes('birthday');
}

function nombreCumpleanero(asunto: string): string {
  const limpio = asunto.trim().replace(/^[([{"']+|[)\]}"']+$/g, '').trim();
  const nombre = limpio.replace(
    /^(?:cumplea[nñ]os(?:\s+de)?|birthday(?:\s+(?:of|for))?)\s*[:\-–]?\s*/i,
    '',
  ).trim();
  return nombre || limpio || 'una persona del equipo';
}

function normalizar(valor: string): string {
  return valor.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function fechaEventoBogota(iso: string): string {
  const local = new Date(new Date(iso).getTime() + BOGOTA_OFFSET_MS);
  return claveDia(local);
}

function claveDia(fecha: Date): string {
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const day = String(fecha.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function diaAvisoLaboral(fechaEvento: string): string {
  let dia = new Date(`${fechaEvento}T00:00:00Z`);
  dia = new Date(dia.getTime() - 86_400_000);
  while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
    dia = new Date(dia.getTime() - 86_400_000);
  }
  return claveDia(dia);
}

function diferenciaDias(desde: string, hasta: string): number {
  return Math.round(
    (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function nombreDia(fecha: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T00:00:00Z`));
}

function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T00:00:00Z`));
}

function idAvisoCumpleanos(eventId: string, fecha: string): string {
  const hex = createHash('sha256').update(`${eventId}|${fecha}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
