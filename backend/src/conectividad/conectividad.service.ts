import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConnectivityIncident } from './entities/connectivity-incident.entity';
import {
  ConectividadEventosQueryDto,
  ConectividadQueryDto,
  ConectividadRevisionDto,
} from './dto/conectividad-query.dto';

const TZ_OFFSET_MS = 5 * 3_600_000; // Bogotá = UTC-5
const DIA_MS = 86_400_000;

/** Parámetros posicionales para `DataSource.query` ($1, $2, ...). */
class Params {
  readonly args: unknown[] = [];
  ph(value: unknown): string {
    this.args.push(value);
    return `$${this.args.length}`;
  }
}

interface Rango {
  start: Date;
  end: Date;
  desdeStr: string;
  hastaStr: string;
}

function envInt(clave: string, def: number): number {
  const v = Number(process.env[clave]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

/**
 * Clasificación de causas para la UI. La causa describe la EVIDENCIA
 * registrada, no una conclusión técnica: un `timeout` es "comunicación
 * interrumpida" (heartbeat vencido), no "se perdió internet"; un `disconnect`
 * es "el cliente cerró el socket", que puede ser un cierre del navegador sin
 * evento de logout explícito.
 */
export const CAUSA_ETIQUETAS: Record<
  string,
  { etiqueta: string; certeza: 'alta' | 'media' | 'baja' }
> = {
  manual: { etiqueta: 'Cambio manual explícito', certeza: 'alta' },
  timeout: {
    etiqueta: 'Comunicación interrumpida (heartbeat)',
    certeza: 'media',
  },
  disconnect: {
    etiqueta: 'Cliente desconectado (socket cerrado)',
    certeza: 'media',
  },
  sistema: { etiqueta: 'Cambio automático del sistema', certeza: 'baja' },
  almuerzo: { etiqueta: 'Transición de almuerzo', certeza: 'alta' },
  connect: { etiqueta: 'Reconexión confirmada', certeza: 'alta' },
};

@Injectable()
export class ConectividadService {
  private readonly logger = new Logger(ConectividadService.name);
  private readonly CACHE_PREFIX = 'conn:';

  // Reglas de detección de incidentes (configurables por entorno).
  private readonly incHora = envInt('CONNECTIVIDAD_INC_HORA', 3);
  private readonly incDia = envInt('CONNECTIVIDAD_INC_DIA', 5);
  private readonly incCorteMin = envInt('CONNECTIVIDAD_INC_CORTE_MIN', 5);
  private readonly incCriticoMin = envInt('CONNECTIVIDAD_INC_CRITICO_MIN', 15);

  // Ventana laboral (hora Bogotá) usada como "jornada elegible" para los
  // tiempos por estado y la disponibilidad. El tiempo fuera de la ventana no
  // se cuenta ni como disponible ni como desconectado.
  private readonly jornadaIni = envInt('CONNECTIVIDAD_JORNADA_INI', 8);
  private readonly jornadaFin = envInt('CONNECTIVIDAD_JORNADA_FIN', 18);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly dataSource: DataSource,
    @InjectRepository(ConnectivityIncident)
    private readonly incidentRepo: Repository<ConnectivityIncident>,
  ) {}

  // ── Utilidades ─────────────────────────────────────────────────────────────

  private rango(f: ConectividadQueryDto): Rango {
    const hoyMs = Math.floor(Date.now() / DIA_MS) * DIA_MS;
    const desdeStr = f.desde
      ? String(f.desde).slice(0, 10)
      : new Date(hoyMs - 29 * DIA_MS).toISOString().slice(0, 10);
    const hastaStr = f.hasta
      ? String(f.hasta).slice(0, 10)
      : new Date(hoyMs).toISOString().slice(0, 10);
    const desdeMs = Date.parse(`${desdeStr}T00:00:00Z`);
    const hastaMs = Date.parse(`${hastaStr}T00:00:00Z`);
    if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (desdeMs > hastaMs) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }
    return {
      start: new Date(desdeMs + TZ_OFFSET_MS),
      end: new Date(hastaMs + DIA_MS + TZ_OFFSET_MS),
      desdeStr,
      hastaStr,
    };
  }

  /**
   * CTE base `ev` (eventos con LEAD) + `seg` (segmentos recortados al rango y
   * a la ventana laboral de SU día Bogotá). Los segmentos que cruzan la noche
   * quedan cortados al final de la jornada de su día de inicio: la madrugada
   * no se cuenta como actividad ni como desconectado.
   */
  private cteSeg(p: Params, f: ConectividadQueryDto, r: Rango): string {
    const desde = p.ph(r.desdeStr);
    const hasta = p.ph(r.hastaStr);
    const clipIni = p.ph(r.start);
    const clipFin = p.ph(r.end);
    const jini = p.ph(this.jornadaIni);
    const jfin = p.ph(this.jornadaFin);
    const userPh = f.asesorId ? p.ph(f.asesorId) : null;
    return `WITH ev AS (
        SELECT id, user_id, fecha, tipo, estado, almuerzo, causa, desde,
               LEAD(desde) OVER (PARTITION BY user_id ORDER BY desde) AS sig
        FROM advisor_activity_log
        WHERE fecha >= ${desde} AND fecha <= ${hasta}
          ${userPh ? `AND user_id = ${userPh}` : ''}
      ),
      seg AS (
        SELECT ev.user_id, ev.fecha, ev.tipo, ev.causa, ev.id,
               CASE WHEN ev.almuerzo THEN 'almuerzo'
                    ELSE coalesce(ev.estado, 'offline') END AS bucket,
               ev.desde, ev.sig,
               GREATEST(
                 ev.desde, ${clipIni},
                 (ev.fecha::timestamp + ${jini} * interval '1 hour') AT TIME ZONE 'America/Bogota'
               ) AS ini,
               LEAST(
                 COALESCE(ev.sig, now()), ${clipFin},
                 (ev.fecha::timestamp + ${jfin} * interval '1 hour') AT TIME ZONE 'America/Bogota'
               ) AS fin
        FROM ev
        WHERE (ev.sig IS NULL OR ev.sig > ${clipIni})
      )`;
  }

  private async conCache<T>(clave: string, fn: () => Promise<T>): Promise<T> {
    const key = this.CACHE_PREFIX + clave;
    try {
      const cached = await this.cache.get<T>(key);
      if (cached) return cached;
    } catch {
      // La caché es opcional.
    }
    const result = await fn();
    try {
      await this.cache.set(key, result, 30_000);
    } catch {
      // La caché es opcional.
    }
    return result;
  }

  /** Minutos de un bucket desde una fila con los cinco totales. */
  private pctDisponible(
    disponibleMin: number,
    totalMin: number,
    almuerzoMin: number,
  ): number | null {
    const base = totalMin - almuerzoMin;
    return base > 0 ? Math.round((disponibleMin / base) * 100) : null;
  }

  /**
   * Fecha (YYYY-MM-DD) normalizada. node-pg convierte las columnas DATE en
   * objetos Date (medianoche local): sin esto las etiquetas salen rotas
   * (el clásico «NaN oct») y las comparaciones dejan de funcionar.
   */
  private diaIso(v: unknown): string {
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    if (typeof v !== 'string') return '';
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
  }

  /**
   * Estabilidad (%): 100 × (1 − min(1, (minutos de interrupción +
   * 2 min por corte) / max(60, minutos conectados))). Penaliza la frecuencia
   * de cortes y su duración relativa al tiempo conectado. NO es disponibilidad
   * (que mide tiempo disponible / jornada elegible): un día corto pero sin
   * cortes tiene alta estabilidad aunque poca disponibilidad.
   */
  private estabilidad(
    interrupcionMin: number,
    desconexiones: number,
    conectadoMin: number,
  ): number {
    const costo = interrupcionMin + 2 * desconexiones;
    const denom = Math.max(60, conectadoMin);
    return Math.max(
      0,
      Math.min(100, Math.round(100 * (1 - Math.min(1, costo / denom)))),
    );
  }

  // ── Pestaña 1: Resumen general ─────────────────────────────────────────────

  async resumen(f: ConectividadQueryDto) {
    const clave = `res:${f.desde ?? ''}:${f.hasta ?? ''}:${f.asesorId ?? ''}`;
    return this.conCache(clave, () => this.calcularResumen(f));
  }

  private async calcularResumen(f: ConectividadQueryDto) {
    const r = this.rango(f);
    const p = new Params();
    const seg = this.cteSeg(p, f, r);

    const [min, cortes, sesiones, porDiaMin, porDiaCortes, conectados, prev] =
      await Promise.all([
        this.queryMinBucket(p, seg),
        this.queryCortes(p, seg),
        this.querySesiones(p, seg),
        this.queryMinPorDia(p, seg),
        this.queryCortesPorDia(p, seg),
        this.queryConectadosAhora(),
        this.queryPeriodoAnterior(f, r),
      ]);

    const cortesPorDia = new Map<string, number>(
      porDiaCortes.map((x: any) => [this.diaIso(x.fecha), x.count]),
    );
    const tendencia = porDiaMin.map((d: any) => ({
      fecha: this.diaIso(d.fecha),
      disponibleMin: d.disponibleMin,
      ocupadoMin: d.ocupadoMin,
      reunionMin: d.reunionMin,
      almuerzoMin: d.almuerzoMin,
      inactivoMin: d.inactivoMin,
      sinConexionMin: d.inactivoMin,
      desconexiones: cortesPorDia.get(this.diaIso(d.fecha)) ?? 0,
      disponibilidadPct: this.pctDisponible(
        d.disponibleMin,
        d.disponibleMin +
          d.ocupadoMin +
          d.reunionMin +
          d.almuerzoMin +
          d.inactivoMin,
        d.almuerzoMin,
      ),
    }));

    const totalMin =
      min.disponibleMin +
      min.ocupadoMin +
      min.reunionMin +
      min.almuerzoMin +
      min.inactivoMin;
    const conectadoMin = totalMin - min.inactivoMin;
    const ranking = await this.queryRanking(f, r);
    const porHora = await this.queryPorHora(p, seg);

    return {
      rango: { desde: r.desdeStr, hasta: r.hastaStr },
      jornada: { ini: this.jornadaIni, fin: this.jornadaFin },
      conectadosAhora: conectados,
      kpis: {
        disponibleMin: min.disponibleMin,
        ocupadoMin: min.ocupadoMin,
        reunionMin: min.reunionMin,
        almuerzoMin: min.almuerzoMin,
        inactivoMin: min.inactivoMin,
        sinConexionMin: min.inactivoMin,
        totalMin,
        conectadoMin,
        desconexiones: cortes.total,
        desconexionesManual: cortes.manual,
        desconexionesTimeout: cortes.timeout,
        desconexionesDisconnect: cortes.disconnect,
        desconexionesOtro: cortes.otros,
        interrupcionMin: cortes.interrupcionMin,
        cortePromMin: cortes.cortePromMin,
        corteMedMin: cortes.corteMedMin,
        recuperacionPromMin: cortes.recupPromMin,
        recuperacionMedMin: cortes.recupMedMin,
        sinRecuperacion: cortes.sinRecuperacion,
        sesionesTramos: sesiones.tramos,
        sesionPromMin: sesiones.promMin,
        sesionMedMin: sesiones.medMin,
        disponibilidadPct: this.pctDisponible(
          min.disponibleMin,
          totalMin,
          min.almuerzoMin,
        ),
        estabilidadPct: this.estabilidad(
          cortes.interrupcionMin,
          cortes.total,
          conectadoMin,
        ),
      },
      comparacion: prev,
      tendencia,
      porHora,
      ranking,
    };
  }

  private async queryMinBucket(p: Params, seg: string) {
    const rows = await this.dataSource.query(
      `${seg}
       SELECT ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
         FILTER (WHERE fin > ini AND bucket = 'online'), 0))::int AS "disponibleMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
         FILTER (WHERE fin > ini AND bucket = 'busy'), 0))::int AS "ocupadoMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
         FILTER (WHERE fin > ini AND bucket = 'meeting'), 0))::int AS "reunionMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
         FILTER (WHERE fin > ini AND bucket = 'almuerzo'), 0))::int AS "almuerzoMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
         FILTER (WHERE fin > ini AND bucket NOT IN ('online', 'busy', 'meeting', 'almuerzo')), 0))::int AS "inactivoMin"
       FROM seg`,
      p.args,
    );
    const row = rows[0] ?? {};
    return {
      disponibleMin: Number(row.disponibleMin ?? 0),
      ocupadoMin: Number(row.ocupadoMin ?? 0),
      reunionMin: Number(row.reunionMin ?? 0),
      almuerzoMin: Number(row.almuerzoMin ?? 0),
      inactivoMin: Number(row.inactivoMin ?? 0),
    };
  }

  private async queryCortes(p: Params, seg: string) {
    const rows = await this.dataSource.query(
      `${seg}
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE causa = 'manual')::int AS manual,
              COUNT(*) FILTER (WHERE causa = 'timeout')::int AS timeout,
              COUNT(*) FILTER (WHERE causa = 'disconnect')::int AS disconnect,
              COUNT(*) FILTER (WHERE causa IS NULL OR causa NOT IN ('manual', 'timeout', 'disconnect'))::int AS otros,
              COUNT(*) FILTER (WHERE sig IS NULL)::int AS "sinRecuperacion",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "interrupcionMin",
              ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "cortePromMin",
              ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP
                (ORDER BY EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "corteMedMin",
              ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (sig - desde)) / 60)
                FILTER (WHERE sig IS NOT NULL), 0))::int AS "recupPromMin",
              ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP
                (ORDER BY EXTRACT(EPOCH FROM (sig - desde)) / 60)
                FILTER (WHERE sig IS NOT NULL), 0))::int AS "recupMedMin"
       FROM seg
       WHERE tipo = 'desconexion' AND fin > ini`,
      p.args,
    );
    const row = rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      manual: Number(row.manual ?? 0),
      timeout: Number(row.timeout ?? 0),
      disconnect: Number(row.disconnect ?? 0),
      otros: Number(row.otros ?? 0),
      sinRecuperacion: Number(row.sinRecuperacion ?? 0),
      interrupcionMin: Number(row.interrupcionMin ?? 0),
      cortePromMin: Number(row.cortePromMin ?? 0),
      corteMedMin: Number(row.corteMedMin ?? 0),
      recupPromMin: Number(row.recupPromMin ?? 0),
      recupMedMin: Number(row.recupMedMin ?? 0),
    };
  }

  private async querySesiones(p: Params, seg: string) {
    const rows = await this.dataSource.query(
      `${seg}
       SELECT COUNT(*)::int AS tramos,
              ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "promMin",
              ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP
                (ORDER BY EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "medMin"
       FROM seg
       WHERE fin > ini AND bucket <> 'offline'`,
      p.args,
    );
    const row = rows[0] ?? {};
    return {
      tramos: Number(row.tramos ?? 0),
      promMin: Number(row.promMin ?? 0),
      medMin: Number(row.medMin ?? 0),
    };
  }

  private async queryMinPorDia(p: Params, seg: string) {
    const rows = await this.dataSource.query(
      `${seg}
       SELECT fecha,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'online'), 0))::int AS "disponibleMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'busy'), 0))::int AS "ocupadoMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'meeting'), 0))::int AS "reunionMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'almuerzo'), 0))::int AS "almuerzoMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket NOT IN ('online', 'busy', 'meeting', 'almuerzo')), 0))::int AS "inactivoMin"
       FROM seg
       WHERE fin > ini
       GROUP BY fecha
       ORDER BY fecha`,
      p.args,
    );
    return rows;
  }

  private async queryCortesPorDia(p: Params, seg: string) {
    const rows = await this.dataSource.query(
      `${seg}
       SELECT fecha, COUNT(*)::int AS count
       FROM seg
       WHERE tipo = 'desconexion' AND fin > ini
       GROUP BY fecha
       ORDER BY fecha`,
      p.args,
    );
    return rows;
  }

  private async queryPorHora(p: Params, seg: string) {
    const rows = await this.dataSource.query(
      `${seg}
       SELECT EXTRACT(HOUR FROM desde AT TIME ZONE 'America/Bogota')::int AS hora,
              COUNT(*) FILTER (WHERE tipo = 'desconexion' AND fin > ini)::int AS desconexiones,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'online'), 0))::int AS "disponibleMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket NOT IN ('online', 'busy', 'meeting', 'almuerzo')), 0))::int AS "inactivoMin"
       FROM seg
       GROUP BY 1
       ORDER BY 1`,
      p.args,
    );
    return rows.map((x: any) => ({
      hora: Number(x.hora),
      desconexiones: Number(x.desconexiones ?? 0),
      disponibleMin: Number(x.disponibleMin ?? 0),
      inactivoMin: Number(x.inactivoMin ?? 0),
    }));
  }

  private async queryConectadosAhora() {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(json_agg(u.name ORDER BY u.name) FILTER (WHERE u.name IS NOT NULL), '[]') AS nombres
       FROM users u
       WHERE u.role = 'advisor' AND u.active = true AND u.status <> 'offline'`,
    );
    const row = rows[0] ?? {};
    return { total: Number(row.n ?? 0), nombres: row.nombres ?? [] };
  }

  /** KPIs del periodo inmediatamente anterior de la misma longitud. */
  private async queryPeriodoAnterior(f: ConectividadQueryDto, r: Rango) {
    const desdeMs = Date.parse(`${r.desdeStr}T00:00:00Z`);
    const hastaMs = Date.parse(`${r.hastaStr}T00:00:00Z`);
    const len = hastaMs - desdeMs + DIA_MS;
    const prev: ConectividadQueryDto = {
      asesorId: f.asesorId,
      desde: new Date(desdeMs - len).toISOString().slice(0, 10),
      hasta: new Date(desdeMs - DIA_MS).toISOString().slice(0, 10),
    };
    const pr = this.rango(prev);
    const p = new Params();
    const seg = this.cteSeg(p, prev, pr);
    const [min, cortes] = await Promise.all([
      this.queryMinBucket(p, seg),
      this.queryCortes(p, seg),
    ]);
    const totalMin =
      min.disponibleMin +
      min.ocupadoMin +
      min.reunionMin +
      min.almuerzoMin +
      min.inactivoMin;
    return {
      desde: pr.desdeStr,
      hasta: pr.hastaStr,
      disponibleMin: min.disponibleMin,
      ocupadoMin: min.ocupadoMin,
      desconexiones: cortes.total,
      disponibilidadPct: this.pctDisponible(
        min.disponibleMin,
        totalMin,
        min.almuerzoMin,
      ),
    };
  }

  /** Ranking por asesor activo; `tendenciaPct` = Δ disponibilidad vs periodo anterior. */
  private async queryRanking(f: ConectividadQueryDto, r: Rango) {
    const p = new Params();
    const seg = this.cteSeg(p, f, r);
    const [mins, cortesPorUser, users, prevDisp] = await Promise.all([
      this.dataSource.query(
        `${seg}
         SELECT user_id,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE fin > ini AND bucket = 'online'), 0))::int AS "disponibleMin",
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE fin > ini AND bucket = 'busy'), 0))::int AS "ocupadoMin",
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE fin > ini AND bucket = 'meeting'), 0))::int AS "reunionMin",
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE fin > ini AND bucket = 'almuerzo'), 0))::int AS "almuerzoMin",
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE fin > ini AND bucket NOT IN ('online', 'busy', 'meeting', 'almuerzo')), 0))::int AS "inactivoMin"
         FROM seg
         WHERE fin > ini
         GROUP BY user_id`,
        p.args,
      ),
      this.dataSource.query(
        `${seg}
         SELECT user_id,
                COUNT(*)::int AS desconexiones,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "interrupcionMin",
                ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (sig - desde)) / 60)
                  FILTER (WHERE sig IS NOT NULL), 0))::int AS "recupPromMin",
                COUNT(*) FILTER (WHERE sig IS NULL)::int AS "sinRecuperacion"
         FROM seg
         WHERE tipo = 'desconexion' AND fin > ini
         GROUP BY user_id`,
        p.args,
      ),
      this.dataSource.query(
        `SELECT id::text AS id, name AS nombre, status
         FROM users
         WHERE role = 'advisor' AND active = true
         ORDER BY name`,
      ),
      this.queryPrevDisponiblePorUser(f, r),
    ]);

    const minsPorUser = new Map<string, any>(
      mins.map((x: any) => [String(x.user_id), x]),
    );
    const cortesPorId = new Map<string, any>(
      cortesPorUser.map((x: any) => [String(x.user_id), x]),
    );

    return users.map((u: any) => {
      const m = minsPorUser.get(String(u.id)) ?? {};
      const c = cortesPorId.get(String(u.id)) ?? {};
      const disponibleMin = Number(m.disponibleMin ?? 0);
      const ocupadoMin = Number(m.ocupadoMin ?? 0);
      const reunionMin = Number(m.reunionMin ?? 0);
      const almuerzoMin = Number(m.almuerzoMin ?? 0);
      const inactivoMin = Number(m.inactivoMin ?? 0);
      const totalMin =
        disponibleMin + ocupadoMin + reunionMin + almuerzoMin + inactivoMin;
      const desconexiones = Number(c.desconexiones ?? 0);
      const interrupcionMin = Number(c.interrupcionMin ?? 0);
      const conectadoMin = totalMin - inactivoMin;
      // Con menos de 1 hora de datos en el periodo los porcentajes son
      // engañosos: se devuelve null y la UI muestra «Sin datos».
      const suficientes = totalMin >= 60;
      const disp = suficientes
        ? this.pctDisponible(disponibleMin, totalMin, almuerzoMin)
        : null;
      const prev = prevDisp.get(String(u.id));
      const prevTotalPrev = prev
        ? prev.disponibleMin +
          prev.ocupadoMin +
          prev.reunionMin +
          prev.almuerzoMin +
          prev.inactivoMin
        : 0;
      const dispPrev = prev
        ? this.pctDisponible(
            prev.disponibleMin,
            prevTotalPrev,
            prev.almuerzoMin,
          )
        : null;
      return {
        id: String(u.id),
        nombre: u.nombre ?? '—',
        estado: u.status ?? 'offline',
        disponibleMin,
        ocupadoMin,
        reunionMin,
        almuerzoMin,
        inactivoMin,
        sinConexionMin: inactivoMin,
        conectadoMin,
        totalMin,
        desconexiones,
        interrupcionMin,
        recuperacionPromMin: Number(c.recupPromMin ?? 0),
        sinRecuperacion: Number(c.sinRecuperacion ?? 0),
        disponibilidadPct: disp,
        estabilidadPct: suficientes
          ? this.estabilidad(interrupcionMin, desconexiones, conectadoMin)
          : null,
        tendenciaPct:
          disp !== null && dispPrev !== null ? disp - dispPrev : null,
      };
    });
  }

  private async queryPrevDisponiblePorUser(f: ConectividadQueryDto, r: Rango) {
    const desdeMs = Date.parse(`${r.desdeStr}T00:00:00Z`);
    const hastaMs = Date.parse(`${r.hastaStr}T00:00:00Z`);
    const len = hastaMs - desdeMs + DIA_MS;
    const prev: ConectividadQueryDto = {
      asesorId: f.asesorId,
      desde: new Date(desdeMs - len).toISOString().slice(0, 10),
      hasta: new Date(desdeMs - DIA_MS).toISOString().slice(0, 10),
    };
    const pr = this.rango(prev);
    const p = new Params();
    const seg = this.cteSeg(p, prev, pr);
    const rows = await this.dataSource.query(
      `${seg}
       SELECT user_id,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'online'), 0))::int AS "disponibleMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'busy'), 0))::int AS "ocupadoMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'meeting'), 0))::int AS "reunionMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket = 'almuerzo'), 0))::int AS "almuerzoMin",
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                FILTER (WHERE fin > ini AND bucket NOT IN ('online', 'busy', 'meeting', 'almuerzo')), 0))::int AS "inactivoMin"
       FROM seg
       WHERE fin > ini
       GROUP BY user_id`,
      p.args,
    );
    return new Map<string, any>(rows.map((x: any) => [String(x.user_id), x]));
  }

  // ── Pestaña 3: Mapa de calor y distribución por hora ───────────────────────

  async mapaCalor(
    f: ConectividadQueryDto,
    metrica:
      | 'desconexiones'
      | 'minutos'
      | 'afectados'
      | 'disponibilidad' = 'desconexiones',
  ) {
    const clave = `mapa:${metrica}:${f.desde ?? ''}:${f.hasta ?? ''}:${f.asesorId ?? ''}`;
    return this.conCache(clave, () => this.calcularMapa(f, metrica));
  }

  private async calcularMapa(
    f: ConectividadQueryDto,
    metrica: 'desconexiones' | 'minutos' | 'afectados' | 'disponibilidad',
  ) {
    const r = this.rango(f);
    const p = new Params();
    const seg = this.cteSeg(p, f, r);
    const [cortes, buckets] = await Promise.all([
      this.dataSource.query(
        `${seg}
         SELECT EXTRACT(DOW FROM desde AT TIME ZONE 'America/Bogota')::int AS dia,
                EXTRACT(HOUR FROM desde AT TIME ZONE 'America/Bogota')::int AS hora,
                COUNT(*)::int AS desconexiones,
                COUNT(DISTINCT user_id)::int AS afectados,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "minutos"
         FROM seg
         WHERE tipo = 'desconexion' AND fin > ini
         GROUP BY 1, 2`,
        p.args,
      ),
      this.dataSource.query(
        `${seg}
         SELECT EXTRACT(DOW FROM desde AT TIME ZONE 'America/Bogota')::int AS dia,
                EXTRACT(HOUR FROM desde AT TIME ZONE 'America/Bogota')::int AS hora,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE bucket = 'online'), 0))::int AS "disponibleMin",
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60)
                  FILTER (WHERE bucket = 'almuerzo'), 0))::int AS "almuerzoMin",
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (fin - ini)) / 60), 0))::int AS "totalMin"
         FROM seg
         WHERE fin > ini
         GROUP BY 1, 2`,
        p.args,
      ),
    ]);

    const celdas = new Map<string, any>();
    for (const row of buckets) {
      const dia = Number(row.dia);
      const hora = Number(row.hora);
      const total = Number(row.totalMin ?? 0);
      const almuerzo = Number(row.almuerzoMin ?? 0);
      const base = total - almuerzo;
      celdas.set(`${dia}:${hora}`, {
        dia,
        hora,
        desconexiones: 0,
        minutos: 0,
        afectados: 0,
        disponibilidadPct:
          base > 0
            ? Math.round((Number(row.disponibleMin ?? 0) / base) * 100)
            : null,
      });
    }
    for (const row of cortes) {
      const dia = Number(row.dia);
      const hora = Number(row.hora);
      const key = `${dia}:${hora}`;
      const celda = celdas.get(key) ?? {
        dia,
        hora,
        desconexiones: 0,
        minutos: 0,
        afectados: 0,
        disponibilidadPct: null,
      };
      celda.desconexiones = Number(row.desconexiones ?? 0);
      celda.minutos = Number(row.minutos ?? 0);
      celda.afectados = Number(row.afectados ?? 0);
      celdas.set(key, celda);
    }

    const items = [...celdas.values()].map((c) => ({
      ...c,
      valor:
        metrica === 'desconexiones'
          ? c.desconexiones
          : metrica === 'minutos'
            ? c.minutos
            : metrica === 'afectados'
              ? c.afectados
              : c.disponibilidadPct,
    }));

    return {
      rango: { desde: r.desdeStr, hasta: r.hastaStr },
      metrica,
      items,
    };
  }

  // ── Pestañas 4 y 5: incidentes e historial ─────────────────────────────────

  async incidentes(
    f: ConectividadQueryDto & {
      estado?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const r = this.rango(f);
    const p = new Params();
    const seg = this.cteSeg(p, f, r);
    const [cortes, rafagas, dias, nombres] = await Promise.all([
      this.dataSource.query(
        `${seg}
         SELECT user_id, desde, sig, causa
         FROM seg
         WHERE tipo = 'desconexion' AND fin > ini
         ORDER BY desde DESC`,
        p.args,
      ),
      this.dataSource.query(
        `${seg}
         SELECT user_id,
                date_trunc('hour', desde AT TIME ZONE 'America/Bogota') AS hora,
                COUNT(*)::int AS n
         FROM seg
         WHERE tipo = 'desconexion' AND fin > ini
         GROUP BY 1, 2
         HAVING COUNT(*) >= $${p.args.length + 1}`,
        [...p.args, this.incHora],
      ),
      this.dataSource.query(
        `${seg}
         SELECT user_id, fecha, COUNT(*)::int AS n
         FROM seg
         WHERE tipo = 'desconexion' AND fin > ini
         GROUP BY 1, 2
         HAVING COUNT(*) >= $${p.args.length + 1}`,
        [...p.args, this.incDia],
      ),
      this.dataSource.query(
        `SELECT id::text AS id, name AS nombre FROM users WHERE role = 'advisor'`,
      ),
    ]);

    const nombrePorId = new Map<string, string>(
      nombres.map((x: any) => [String(x.id), x.nombre]),
    );
    const ahora = Date.now();
    const items: any[] = [];

    for (const c of cortes) {
      const desde = new Date(c.desde).getTime();
      const sig = c.sig ? new Date(c.sig).getTime() : null;
      const fin = sig ?? ahora;
      const duracionMin = Math.max(0, Math.round((fin - desde) / 60000));
      const reglas: string[] = [];
      if (duracionMin >= this.incCriticoMin)
        reglas.push(`corte_critico_${this.incCriticoMin}min`);
      else if (duracionMin >= this.incCorteMin)
        reglas.push(`corte_largo_${this.incCorteMin}min`);
      if (sig === null) reglas.push('sin_reconexion');
      if (reglas.length === 0) continue;
      const userId = String(c.user_id);
      items.push({
        clave: `${userId}:${new Date(c.desde).toISOString()}`,
        tipo: 'corte',
        userId,
        nombre: nombrePorId.get(userId) ?? '—',
        desde: new Date(c.desde).toISOString(),
        hasta: sig !== null ? new Date(sig).toISOString() : null,
        duracionMin,
        causa: c.causa ?? null,
        reglas,
      });
    }

    for (const x of rafagas) {
      const userId = String(x.user_id);
      const hora = new Date(x.hora).toISOString();
      items.push({
        clave: `${userId}:${hora.slice(0, 13)}:rafaga`,
        tipo: 'rafaga',
        userId,
        nombre: nombrePorId.get(userId) ?? '—',
        desde: hora,
        hasta: null,
        duracionMin: null,
        causa: null,
        reglas: [`rafaga_${this.incHora}h`],
        nEventos: Number(x.n ?? 0),
      });
    }

    for (const x of dias) {
      const userId = String(x.user_id);
      const fecha = this.diaIso(x.fecha);
      items.push({
        clave: `${userId}:${fecha}:dia`,
        tipo: 'dia',
        userId,
        nombre: nombrePorId.get(userId) ?? '—',
        desde: `${fecha}T12:00:00.000Z`,
        hasta: null,
        duracionMin: null,
        causa: null,
        reglas: [`desconexiones_dia_${this.incDia}`],
        nEventos: Number(x.n ?? 0),
      });
    }

    items.sort((a, b) => (a.desde < b.desde ? 1 : -1));

    // Merge con las revisiones humanas guardadas.
    const userIds = [...new Set(items.map((i) => i.userId))];
    const revisiones = userIds.length
      ? await this.incidentRepo.find({ where: { userId: In(userIds) } })
      : [];
    const revPorClave = new Map<string, ConnectivityIncident>(
      revisiones.map((x) => [x.clave, x]),
    );
    for (const item of items) {
      const rev = revPorClave.get(item.clave);
      item.estado = rev?.estado ?? 'nuevo';
      item.comentario = rev?.comentario ?? null;
      item.responsableId = rev?.responsableId ?? null;
      item.revisadoEn = rev?.actualizadoEn ?? null;
    }

    const filtrados = f.estado
      ? items.filter((x) => x.estado === f.estado)
      : items;
    const page = Math.max(1, f.page ?? 1);
    const limit = Math.min(200, Math.max(1, f.limit ?? 20));

    return {
      rango: { desde: r.desdeStr, hasta: r.hastaStr },
      reglas: {
        rafagaHora: this.incHora,
        desconexionesDia: this.incDia,
        corteMin: this.incCorteMin,
        criticoMin: this.incCriticoMin,
      },
      resumen: {
        total: items.length,
        cortes: items.filter((x) => x.tipo === 'corte').length,
        rafagas: items.filter((x) => x.tipo === 'rafaga').length,
        diasInestables: items.filter((x) => x.tipo === 'dia').length,
        abiertos: items.filter(
          (x) => x.estado === 'nuevo' || x.estado === 'en_revision',
        ).length,
      },
      total: filtrados.length,
      page,
      pages: Math.max(1, Math.ceil(filtrados.length / limit)),
      items: filtrados.slice((page - 1) * limit, page * limit),
    };
  }

  /** Guarda (upsert) la revisión humana de un incidente detectado. */
  async revisarIncidente(
    userId: string,
    clave: string,
    dto: ConectividadRevisionDto,
    responsableId: string,
  ) {
    if (!userId || !clave || clave.split(':')[0] !== userId) {
      throw new BadRequestException('Clave de incidente inválida');
    }
    const existente = await this.incidentRepo.findOne({
      where: { userId, clave },
    });
    if (existente) {
      existente.estado = dto.estado;
      existente.comentario = dto.comentario ?? existente.comentario;
      existente.responsableId = responsableId;
      await this.incidentRepo.save(existente);
      return existente;
    }
    const nuevo = this.incidentRepo.create({
      userId,
      clave,
      estado: dto.estado,
      comentario: dto.comentario ?? null,
      responsableId,
    });
    return this.incidentRepo.save(nuevo);
  }

  /** Historial de eventos paginado con filtros (total real de la consulta). */
  async eventos(f: ConectividadEventosQueryDto) {
    const r = this.rango(f);
    const p = new Params();
    const seg = this.cteSeg(p, f, r);
    const where: string[] = ['fin > ini'];
    if (f.tipo) where.push(`tipo = ${p.ph(f.tipo)}`);
    if (f.causa) where.push(`coalesce(causa, 'sistema') = ${p.ph(f.causa)}`);
    if (f.estado) where.push(`bucket = ${p.ph(f.estado)}`);
    if (f.durMin !== undefined)
      where.push(`EXTRACT(EPOCH FROM (fin - ini)) / 60 >= ${p.ph(f.durMin)}`);
    if (f.durMax !== undefined)
      where.push(`EXTRACT(EPOCH FROM (fin - ini)) / 60 <= ${p.ph(f.durMax)}`);
    const whereSql = where.join(' AND ');
    const page = Math.max(1, f.page ?? 1);
    const limit = Math.min(200, Math.max(1, f.limit ?? 50));
    const orden = f.orden === 'asc' ? 'ASC' : 'DESC';

    const [filas, totalRow] = await Promise.all([
      this.dataSource.query(
        `${seg}
         SELECT seg.id, seg.user_id AS "asesorId", u.name AS nombre, seg.fecha,
                seg.ini AS desde, seg.fin AS hasta, seg.tipo, seg.causa, seg.bucket AS estado,
                ROUND(EXTRACT(EPOCH FROM (seg.fin - seg.ini)) * 1000)::bigint AS "duracionMs"
         FROM seg
         JOIN users u ON u.id = seg.user_id
         WHERE ${whereSql}
         ORDER BY seg.desde ${orden}
         LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        p.args,
      ),
      this.dataSource.query(
        `${seg}
         SELECT COUNT(*)::int AS n
         FROM seg
         WHERE ${whereSql}`,
        p.args,
      ),
    ]);

    return {
      rango: { desde: r.desdeStr, hasta: r.hastaStr },
      total: Number(totalRow[0]?.n ?? 0),
      page,
      pages: Math.max(1, Math.ceil(Number(totalRow[0]?.n ?? 0) / limit)),
      items: filas.map((x: any) => ({
        id: x.id,
        asesorId: String(x.asesorId),
        nombre: x.nombre ?? '—',
        fecha: this.diaIso(x.fecha),
        desde: new Date(x.desde).toISOString(),
        hasta: new Date(x.hasta).toISOString(),
        duracionMs: Number(x.duracionMs ?? 0),
        tipo: x.tipo,
        causa: x.causa ?? null,
        estado: x.estado,
        causaInfo: CAUSA_ETIQUETAS[x.causa ?? ''] ?? null,
      })),
    };
  }

  /** CSV del historial filtrado (respeta los filtros; tope 20 000 filas). */
  async exportCsv(f: ConectividadEventosQueryDto) {
    const pagina = await this.eventos({
      ...f,
      page: 1,
      limit: 200,
      orden: f.orden ?? 'desc',
    });
    const filas: any[] = [...pagina.items];
    let page = 1;
    while (filas.length < Math.min(20_000, pagina.total) && page < 100) {
      page += 1;
      const sig = await this.eventos({
        ...f,
        page,
        limit: 200,
        orden: f.orden ?? 'desc',
      });
      if (!sig.items.length) break;
      filas.push(...sig.items);
    }
    const esc = (v: string | number | boolean | null | undefined) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cab = [
      'Asesor',
      'Correo dia',
      'Desde (UTC)',
      'Hasta (UTC)',
      'Duracion (min)',
      'Tipo',
      'Estado',
      'Causa',
      'Certeza',
    ];
    const lineas = filas.map((x) =>
      [
        x.nombre,
        x.fecha,
        x.desde,
        x.hasta,
        Math.round((x.duracionMs ?? 0) / 60000),
        x.tipo,
        x.estado,
        x.causa ?? '',
        x.causaInfo?.certeza ?? '',
      ]
        .map(esc)
        .join(','),
    );
    return {
      nombre: `conectividad-${f.desde ?? ''}-${f.hasta ?? ''}.csv`,
      csv: `\uFEFF${cab.join(',')}\n${lineas.join('\n')}`,
      filas: filas.length,
    };
  }
}
