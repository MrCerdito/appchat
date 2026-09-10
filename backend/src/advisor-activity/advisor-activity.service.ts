import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, In, Repository } from 'typeorm';
import {
  AdvisorActivityLog,
  EstadoActividad,
  TipoActividad,
} from './entities/advisor-activity.entity';
import { RedisStateService } from '../common/redis/redis-state.service';
import { User } from '../auth/entities/user.entity';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { HorarioSlot } from '../configuracion/entities/configuracion.entity';

export interface RegistrarActividadOpts {
  tipo?: TipoActividad;
  causa?: string;
}

export interface PeriodoActividad {
  desde: string; // ISO
  hasta: string | null; // ISO (null = vigente "hasta ahora")
  duracionMs: number;
  estado: EstadoActividad;
  almuerzo: boolean;
  tipo: TipoActividad;
  causa: string | null;
}

export interface ActividadAsesorItem {
  asesorId: string;
  nombre: string | null;
  email: string | null;
  profilePhotoUrl: string | null;
  rol: string | null;
  resumen: {
    disponibleMin: number;
    ocupadoMin: number;
    almuerzoMin: number;
    inactivoMin: number;
    desconexiones: number;
    primeraConexion: string | null;
    ultimaAccion: {
      tipo: string;
      estado: string;
      almuerzo: boolean;
      desde: string;
      mensaje: string;
    } | null;
    estadoFinal: string | null;
    segmentoAbierto: boolean;
    sinActividadAntesDe: string | null;
  };
  periodos: PeriodoActividad[];
}

export interface JornadaDia {
  activa: boolean;
  slots: { inicio: string; fin: string }[];
}

export interface HistorialDiaResult {
  fecha: string;
  esHoy: boolean;
  jornada: JornadaDia;
  asesores: ActividadAsesorItem[];
}

export const OFFSET_BOGOTA_MIN = -5 * 60;

/** Duración en mm:ss o h:mm legible para mensajes del historial. */
export function formatoDuracion(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '0m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function aIso(d: Date): string {
  return d.toISOString();
}

@Injectable()
export class AdvisorActivityService {
  private readonly logger = new Logger(AdvisorActivityService.name);
  private static readonly RETENTION_DAYS = 90;

  constructor(
    @InjectRepository(AdvisorActivityLog)
    private readonly activityRepo: Repository<AdvisorActivityLog>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly redisState: RedisStateService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const limite = new Date();
      limite.setUTCDate(limite.getUTCDate() - AdvisorActivityService.RETENTION_DAYS);
      const res = await this.activityRepo.delete({
        desde: LessThan(limite),
      });
      if ((res.affected ?? 0) > 0) {
        this.logger.log(
          `[Historial] Purga: ${res.affected} evento(s) anteriores a ${AdvisorActivityService.RETENTION_DAYS} días`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[Historial] No se pudo purgar eventos viejos: ${(err as Error).message}`,
      );
    }
  }

  /** Fecha (YYYY-MM-DD) en hora Bogotá (UTC-5) para un instante UTC. */
  private fechaBogota(d: Date): string {
    const bog = new Date(d.getTime() + OFFSET_BOGOTA_MIN * 60000);
    return `${bog.getUTCFullYear()}-${String(bog.getUTCMonth() + 1).padStart(2, '0')}-${String(bog.getUTCDate()).padStart(2, '0')}`;
  }

  /** "08:30" → minutos desde las 00:00 (533). */
  private hhmmToMin(s: string): number {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Recorta un periodo de actividad a la unión de slots de la jornada laboral.
   * Todo lo que cae fuera de los slots se descarta (no se cuenta). Un periodo
   * abierto ("hasta ahora") solo permanece abierto si todavía estamos dentro de
   * un slot en el día de hoy; en otro caso se cierra en el fin del slot.
   */
  private clipAPeriodo(
    p: PeriodoActividad,
    slotRanges: { ini: Date; fin: Date }[],
    esHoy: boolean,
    ahora: Date,
  ): PeriodoActividad[] {
    const out: PeriodoActividad[] = [];
    const desdeMs = new Date(p.desde).getTime();
    const hastaMs = p.hasta ? new Date(p.hasta).getTime() : ahora.getTime();
    for (const r of slotRanges) {
      const ini = Math.max(desdeMs, r.ini.getTime());
      const abierto =
        esHoy &&
        p.hasta === null &&
        hastaMs >= r.ini.getTime() &&
        hastaMs < r.fin.getTime();
      const fin = abierto ? hastaMs : Math.min(hastaMs, r.fin.getTime());
      const dur = fin - ini;
      if (dur <= 0) continue;
      out.push({
        desde: aIso(new Date(ini)),
        hasta: abierto ? null : aIso(new Date(fin)),
        duracionMs: dur,
        estado: p.estado,
        almuerzo: p.almuerzo,
        tipo: p.tipo,
        causa: p.causa,
      });
    }
    return out;
  }

  /**
   * Registra un evento de actividad. Solo guarda si el estado efectivo cambió.
   * Se invoca desde SessionsService.setAdvisorStatus (chokepoint de TODOS los
   * cambios de estado de asesor: conexión, desconexión, manual, almuerzo).
   */
  async registrar(
    advisorId: string,
    estado: EstadoActividad,
    opts: RegistrarActividadOpts = {},
  ): Promise<void> {
    if (!advisorId) return;
    let almuerzo = false;
    let tipo: TipoActividad = opts.tipo ?? 'status';
    const causa = opts.causa ?? 'sistema';

    if (causa === 'disconnect' || causa === 'timeout') {
      tipo = 'desconexion';
    } else if (causa === 'connect' && estado === 'online') {
      tipo = 'conexion';
    } else if (causa === 'almuerzo_inicio') {
      tipo = 'almuerzo_inicio';
      almuerzo = true;
    } else if (causa === 'almuerzo_fin') {
      tipo = 'almuerzo_fin';
      almuerzo = false;
    } else if (
      (causa === 'connect' || causa === 'manual') &&
      (await this.redisState.isOnLunch(advisorId).catch(() => false))
    ) {
      // El asesor está en almuerzo aunque el evento sea connect/manual:
      // el estado efectivo 'busy' se marca como almuerzo para el historial.
      almuerzo = true;
    }

    const ahora = new Date();
    try {
      // Dedupe defensivo: si el último evento registrado ya tiene este estado
      // efectivo, la llamada es redundante (doble evento, espejo, carrera) y
      // no se guarda para no inflar el historial con periodos de 0s.
      const ultimo = await this.activityRepo
        .findOne({ where: { userId: advisorId }, order: { desde: 'DESC' } })
        .catch(() => null);
      if (ultimo && ultimo.estado === estado && ultimo.almuerzo === almuerzo) {
        return;
      }

      await this.activityRepo.insert({
        userId: advisorId,
        fecha: this.fechaBogota(ahora),
        tipo,
        estado,
        almuerzo,
        causa,
        desde: ahora,
        hasta: null,
      });
    } catch (err) {
      this.logger.warn(
        `[Historial] Error registrando evento de ${advisorId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Historial del día (hora Bogotá).
   * - Si no se pasa fecha, se toma hoy.
   * - Los segmentos se construyen cerrando cada evento al siguiente; el último
   *   de un día pasado se cierra a medianoche, y el de hoy "hasta ahora".
   */
  async historialDia(
    fecha?: string,
    asesorId?: string,
  ): Promise<HistorialDiaResult> {
    const ahora = new Date();
    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : this.fechaBogota(ahora);

    // Rango del día en UTC a partir de la fecha Bogotá.
    const [y, m, dd] = dia.split('-').map(Number);
    const dayStartUtc = new Date(Date.UTC(y, m - 1, dd) - OFFSET_BOGOTA_MIN * 60000);
    const mananaUtc = new Date(dayStartUtc.getTime() + 24 * 3600000);
    const esHoy = dayStartUtc.getTime() <= ahora.getTime() && ahora.getTime() < mananaUtc.getTime();
    const dayEnd = esHoy ? ahora : mananaUtc;

    // Jornada laboral configurada para la fecha consultada (hora Bogotá).
    let slotsDia: HorarioSlot[] = [];
    try {
      const config = await this.configuracion.getGlobal().catch(() => null);
      if (config?.horariosActivos && Array.isArray(config.horarios)) {
        const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
        slotsDia = config.horarios
          .filter((h) => h.dia === dow)
          .sort((a, b) => this.hhmmToMin(a.inicio) - this.hhmmToMin(b.inicio));
      }
    } catch {
      slotsDia = [];
    }
    const jornadaActiva = slotsDia.length > 0;
    const slotRanges = slotsDia.map((s) => ({
      ini: new Date(dayStartUtc.getTime() + this.hhmmToMin(s.inicio) * 60000),
      fin: new Date(dayStartUtc.getTime() + this.hhmmToMin(s.fin) * 60000),
    }));
    const jornadaIniMs = jornadaActiva
      ? slotRanges[0].ini.getTime()
      : dayStartUtc.getTime();
    const jornadaFinMs = jornadaActiva
      ? Math.max(...slotRanges.map((r) => r.fin.getTime()))
      : mananaUtc.getTime();

    // Ventana ampliada para capturar el periodo abierto que venía de ayer.
    const desdeAmpl = new Date(dayStartUtc.getTime() - 2 * 86400000);

    const donde: any = { desde: Between(desdeAmpl, dayEnd) };
    if (asesorId) donde.userId = asesorId;

    const eventos = await this.activityRepo.find({
      where: donde,
      order: { desde: 'ASC' },
    });

    const porAsesor: Record<string, AdvisorActivityLog[]> = {};
    for (const ev of eventos) {
      (porAsesor[ev.userId] ??= []).push(ev);
    }

    const ids = Object.keys(porAsesor);
    const usuarios =
      ids.length > 0
        ? await this.userRepo
            .find({ where: { id: In(ids), role: In(['advisor', 'admin', 'desarrollador']) } })
            .catch(() => [] as User[])
        : [];
    const mapa = new Map(usuarios.map((u) => [u.id, u]));

    const asesores: ActividadAsesorItem[] = [];

    for (const userId of ids) {
      const lista = porAsesor[userId];
      const user = mapa.get(userId);

      // Periodo abierto previo al día (opener): define el estado al arrancar el día.
      const periodos: PeriodoActividad[] = [];
      const previo: AdvisorActivityLog | null = lista.find((e) => e.desde < dayStartUtc) ?? null;

      const eventosDelDia = lista.filter((e) => e.desde >= dayStartUtc && e.desde < dayEnd);

      const abrir = (ev: AdvisorActivityLog) => {
        const dIni = ev.desde < dayStartUtc ? dayStartUtc : ev.desde;
        periodos.push({
          desde: aIso(dIni),
          hasta: null,
          duracionMs: 0,
          estado: ev.estado,
          almuerzo: ev.almuerzo,
          tipo: ev.tipo,
          causa: ev.causa,
        });
      };

      const cerrarAbierto = (hasta: Date) => {
        const p = periodos[periodos.length - 1];
        if (!p || p.hasta !== null) return;
        p.hasta = aIso(hasta);
        p.duracionMs = hasta.getTime() - new Date(p.desde).getTime();
      };

      // El "opener" (periodo que venía abierto de días previos) abre el día.
      let abierto: AdvisorActivityLog | null = previo ?? null;
      if (abierto) abrir(abierto);

      for (const ev of eventosDelDia) {
        // Evento redundante: el mismo estado efectivo ya está vigente
        // (duplicados por doble llamada o eventos espejo). Se ignoran para
        // no inflar la línea de tiempo con periodos de 0s.
        if (
          abierto &&
          abierto.estado === ev.estado &&
          abierto.almuerzo === ev.almuerzo
        ) {
          continue;
        }
        cerrarAbierto(ev.desde);
        abierto = ev;
        abrir(ev);
      }

      // Cierre del último periodo abierto (hoy "hasta ahora", pasado a medianoche).
      if (abierto) {
        const p = periodos[periodos.length - 1];
        if (p && p.hasta === null) {
          const fin = esHoy ? ahora : dayEnd;
          if (fin.getTime() > new Date(p.desde).getTime()) {
            p.hasta = esHoy ? null : aIso(dayEnd);
            p.duracionMs = fin.getTime() - new Date(p.desde).getTime();
          } else if (!esHoy) {
            periodos.pop();
          }
        }
      }

      if (periodos.length === 0) {
        // Sin eventos: asesor sin actividad registrada en el día.
        asesores.push(
          this.itemVacio(user, dia, esHoy, userId, jornadaActiva, jornadaIniMs, jornadaFinMs),
        );
        continue;
      }

      // Recorte a la jornada laboral: solo se cuenta el tiempo dentro de los
      // slots configurados. Sin jornada (o día sin horario) se mantiene el día completo.
      const finales: PeriodoActividad[] = jornadaActiva
        ? periodos.flatMap((p) => this.clipAPeriodo(p, slotRanges, esHoy, ahora))
        : periodos;

      if (finales.length === 0) {
        asesores.push(
          this.itemVacio(user, dia, esHoy, userId, jornadaActiva, jornadaIniMs, jornadaFinMs),
        );
        continue;
      }

      // Resumen (solo tiempo dentro de la jornada).
      let disponibleMin = 0;
      let ocupadoMin = 0;
      let almuerzoMin = 0;
      let inactivoMin = 0;
      let desconexiones = 0;

      for (const p of finales) {
        const min = Math.round(p.duracionMs / 60000);
        if (p.almuerzo) almuerzoMin += min;
        else if (p.estado === 'online') disponibleMin += min;
        else if (p.estado === 'busy') ocupadoMin += min;
        else inactivoMin += min;
        if (p.tipo === 'desconexion') desconexiones++;
      }
      const primerConexion = finales.find((p) => p.tipo === 'conexion');
      const primeraConexion = primerConexion ? primerConexion.desde : null;

      const últimoPeriodo = finales[finales.length - 1];
      const segmentoAbierto = !!últimoPeriodo && últimoPeriodo.hasta === null;
      const ult = últimoPeriodo;

      const sinonimos: Record<string, string> = {
        conexion: 'Conectado',
        desconexion: 'Desconectado',
        almuerzo_inicio: 'Inicio de almuerzo',
        almuerzo_fin: 'Fin de almuerzo',
      };

      asesores.push({
        asesorId: userId,
        nombre: user?.name ?? null,
        email: user?.email ?? null,
        profilePhotoUrl: user?.profilePhotoUrl ?? null,
        rol: user?.role ?? null,
        resumen: {
          disponibleMin,
          ocupadoMin,
          almuerzoMin,
          inactivoMin,
          desconexiones,
          primeraConexion,
          ultimaAccion: ult
            ? {
                tipo: ult.tipo,
                estado: ult.estado,
                almuerzo: ult.almuerzo,
                desde: ult.desde,
                mensaje: `${sinonimos[ult.tipo] ?? 'Cambio de estado'} → ${
                  ult.estado === 'busy'
                    ? ult.almuerzo
                      ? 'Almuerzo'
                      : 'Ocupado'
                    : ult.estado === 'online'
                      ? 'Disponible'
                      : 'Inactivo'
                }`,
              }
            : null,
          estadoFinal: últimoPeriodo?.estado ?? null,
          segmentoAbierto,
          sinActividadAntesDe: finales.length ? finales[0].desde : null,
        },
        periodos: finales,
      });
    }

    asesores.sort((a, b) =>
      (a.nombre ?? '').localeCompare(b.nombre ?? ''),
    );

    return {
      fecha: dia,
      esHoy,
      jornada: {
        activa: jornadaActiva,
        slots: slotsDia.map((s) => ({ inicio: s.inicio, fin: s.fin })),
      },
      asesores,
    };
  }

  private itemVacio(
    user: User | undefined,
    dia: string,
    esHoy: boolean,
    userId: string,
    jornadaActiva: boolean,
    jornadaIniMs: number,
    jornadaFinMs: number,
  ): ActividadAsesorItem {
    const inactivoMin = esHoy
      ? 0
      : Math.round((jornadaFinMs - jornadaIniMs) / 60000);
    return {
      asesorId: userId,
      nombre: user?.name ?? null,
      email: user?.email ?? null,
      profilePhotoUrl: user?.profilePhotoUrl ?? null,
      rol: user?.role ?? null,
      resumen: {
        disponibleMin: 0,
        ocupadoMin: 0,
        almuerzoMin: 0,
        inactivoMin,
        desconexiones: 0,
        primeraConexion: null,
        ultimaAccion: null,
        estadoFinal: null,
        segmentoAbierto: false,
        sinActividadAntesDe: null,
      },
      periodos: [],
    };
  }
}