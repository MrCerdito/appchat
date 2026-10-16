import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { MetricsDashboardQueryDto } from './dto/metrics-dashboard-query.dto';
import { CalendarWarmService } from '../calendario/calendar-warm.service';
import { EventoCalendarioDto } from '../calendario/dto/calendario-grupo.dto';
import { proyectoDeTipoColegio } from '../calendario/modalidad.util';

// Zona horaria del sistema (coincide con el resto de métricas).
const TZ = 'America/Bogota';
const TZ_OFFSET_MS = 5 * 3_600_000; // Bogotá = UTC-5
const DIA_MS = 86_400_000;

/** Filas por página de la tabla de reuniones. */
const TABLA_PAGINA_REUNIONES = 15;

/** Reuniones que muestra la tarjeta lateral de "Próximas" (es un resumen). */
const PROXIMAS_LISTA_MAX = 5;

/**
 * Expresión de proyecto (Sian365 / ControlAcademic) resuelta desde
 * `colegios.tipo_colegio` relacionando por nombre (sessions.colegio es string,
 * sin FK). Mismo criterio que `SessionsService.getDashboard`.
 */
const PROYECTO_SESIONES = `CASE
  WHEN lower(coalesce(c.tipo_colegio, '')) ~ 'control|academic' THEN 'ControlAcademic'
  WHEN lower(coalesce(c.tipo_colegio, '')) ~ 'sian|365' THEN 'Sian365'
  ELSE 'Sin clasificar' END`;

/**
 * Fecha real de un correo: cuándo se recibió (o, en su defecto, se envió o se
 * registró). `created_at` es la fecha de SINCRONIZACIÓN: todo el historial se
 * importa el mismo día, así que filtrar por ahí esconde los correos de meses
 * anteriores (el módulo Correos filtra por `received_at`).
 */
const FECHA_CORREO = 'coalesce(m.received_at, m.sent_at, m.created_at)';

/** Parámetros posicionales para `DataSource.query` ($1, $2, ...). */
class Params {
  readonly args: unknown[] = [];
  ph(value: unknown): string {
    this.args.push(value);
    return `$${this.args.length}`;
  }
}

interface Rango {
  start: Date | null;
  end: Date | null;
  desdeStr: string;
  hastaStr: string;
}

type Filtros = MetricsDashboardQueryDto;

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly CACHE_PREFIX = 'metrics:';

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly dataSource: DataSource,
    // Reutiliza el CalendarioGrupoService en memoria (misma instancia, mismo
    // cliente de Graph, misma caché) en vez de abrir un segundo viaje a M365.
    private readonly warm: CalendarWarmService,
  ) {}

  // ── Utilidades de rango ───────────────────────────────────────────────────
  /**
   * Rango en horas de Bogotá: desde inclusive a partir de medianoche local,
   * hasta inclusive en su día (se suma 1 día y queda exclusive). `desdeStr` /
   * `hastaStr` son las fechas locales (para `advisor_activity_log.fecha`).
   */
  private rango(f: Filtros): Rango {
    const desdeMs = f.desde ? Date.parse(String(f.desde).slice(0, 10)) : NaN;
    const hastaMs = f.hasta ? Date.parse(String(f.hasta).slice(0, 10)) : NaN;
    if (!Number.isNaN(desdeMs) && !Number.isNaN(hastaMs) && desdeMs > hastaMs) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }
    return {
      start: Number.isNaN(desdeMs) ? null : new Date(desdeMs + TZ_OFFSET_MS),
      end: Number.isNaN(hastaMs)
        ? null
        : new Date(hastaMs + DIA_MS + TZ_OFFSET_MS),
      desdeStr: f.desde ? String(f.desde).slice(0, 10) : '1970-01-01',
      hastaStr: f.hasta ? String(f.hasta).slice(0, 10) : '2999-12-31',
    };
  }

  /** Condiciones WHERE sobre `sessions` + JOINs base (colegios y asesor). */
  private whereSesiones(p: Params, f: Filtros, r: Rango): string[] {
    const w: string[] = [];
    if (r.start) w.push(`s.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`s.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') {
      w.push(`${PROYECTO_SESIONES} = ${p.ph(f.proyecto)}`);
    }
    return w;
  }

  private n(value: unknown): number {
    return value == null ? 0 : Number(value);
  }

  private n1(value: unknown): number | null {
    if (value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num * 10) / 10 : null;
  }

  private pct(actual: number, previo: number): number | null {
    if (!previo) return null;
    return Math.round(((actual - previo) / previo) * 100);
  }

  /** Porcentaje simple (actual ÷ base), redondeado; null si la base es 0. */
  private pctRatio(actual: number, base: number): number | null {
    if (!base || base <= 0) return null;
    return Math.round((actual / base) * 100);
  }

  // ── Dashboard completo ────────────────────────────────────────────────────
  async getDashboard(filtros: Filtros) {
    const rango = this.rango(filtros);
    const proyecto = filtros.proyecto ?? 'all';
    const pagina = filtros.tablaPagina ?? 1;
    // La página entra en la clave: sin ella, pedir la 2 reutilizaría la caché de
    // la 1 y la tabla nunca cambiaría.
    const cacheKey = `${this.CACHE_PREFIX}dashboard:${proyecto}:${filtros.desde ?? ''}:${filtros.hasta ?? ''}:${filtros.asesorId ?? ''}:${pagina}`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch {}

    const [
      resumen,
      ticketsEstado,
      ticketsCorreos,
      colegios,
      asesoria,
      atencion,
      reuniones,
      solicitudes,
      conexiones,
    ] = await Promise.all([
      this.seccionResumen(filtros, rango),
      this.seccionTicketsEstado(filtros, rango),
      this.seccionTicketsCorreos(filtros, rango),
      this.seccionColegios(filtros, rango),
      this.seccionAsesoria(filtros, rango),
      this.seccionAtencion(filtros, rango),
      this.seccionReuniones(filtros, rango, pagina),
      this.seccionSolicitudes(filtros, rango),
      this.seccionConexiones(filtros, rango),
    ]);

    // Variación vs. periodo anterior: se calcula al componer porque necesita
    // los valores actuales que llegan en paralelo desde las demás secciones.
    const prev = resumen.previa;
    const variacion = {
      sesiones: this.pct(resumen.kpis.sesiones.total, prev.sesiones.total),
      cerrados: this.pct(resumen.kpis.sesiones.cerrados, prev.sesiones.cerrados),
      ia: this.pct(resumen.kpis.sesiones.ia, prev.sesiones.ia),
      ratings: this.pct(resumen.kpis.ratings.total, prev.ratings),
      tickets: this.pct(ticketsEstado.total, prev.tickets),
      correos: this.pct(resumen.kpis.correos.total, prev.correos),
      reuniones: this.pct(
        reuniones.kpis.total,
        prev.reuniones,
      ),
    };

    const kpisColegios = {
      ...colegios.kpis,
      sesiones: resumen.kpis.sesiones.total,
      avgEstrellas: resumen.kpis.ratings.promedio,
    };
    const kpisAsesoria = {
      ...asesoria.kpis,
      avgEstrellas: resumen.kpis.ratings.promedio,
    };

    const result = {
      generadoEn: new Date().toISOString(),
      filtros: { proyecto, desde: filtros.desde ?? null, hasta: filtros.hasta ?? null, asesorId: filtros.asesorId ?? null },
      resumen: {
        kpis: {
          sesiones: resumen.kpis.sesiones,
          ratings: resumen.kpis.ratings,
          correos: resumen.kpis.correos,
          tickets: {
            total: ticketsEstado.total,
            abiertos: ticketsEstado.abiertos,
            resueltos: ticketsEstado.resueltos,
          },
          reuniones: reuniones.kpis,
          ticketsPorEstado: ticketsEstado.porEstado,
        },
        variacion,
        proyectos: resumen.proyectos,
        gestionCorreos: resumen.gestionCorreos,
        colegios: colegios.tabla.slice(0, 5),
        asesores: asesoria.tabla,
        actividad: {
          proximasReuniones: reuniones.proximas,
        },
      },
      ticketsCorreos,
      colegios: { ...colegios, kpis: kpisColegios },
      asesoria: { ...asesoria, kpis: kpisAsesoria },
      atencion,
      reuniones,
      solicitudes,
      conexiones,
    };

    try {
      await this.cache.set(cacheKey, result, 30_000);
    } catch {}
    return result;
  }

  // ── Sección: resumen ──────────────────────────────────────────────────────
  private async seccionResumen(f: Filtros, r: Rango) {
    const [sesiones, ratings, correos, proyectos, previa, gestionCorreos] =
      await Promise.all([
        this.querySesionesKpis(f, r),
        this.queryRatingsKpis(f, r),
        this.queryCorreosKpis(f, r),
        this.queryProyectos(f, r),
        this.queryVariacionPrevia(f, r),
        this.queryGestionCorreos(f, r),
      ]);
    return {
      kpis: { sesiones, ratings, correos },
      proyectos,
      previa,
      gestionCorreos,
    };
  }

  private async querySesionesKpis(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE s.status = 'closed')::int AS cerrados,
              COUNT(*) FILTER (WHERE s.advisor_id IS NULL)::int AS ia,
              COUNT(*) FILTER (WHERE s.advisor_id IS NOT NULL)::int AS humano,
              COUNT(*) FILTER (WHERE s.tipo_solicitud IS NOT NULL AND s.tipo_solicitud <> '')::int AS clasificadas,
              ROUND(AVG(EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)
                FILTER (WHERE s.status = 'closed' AND s.closed_at IS NOT NULL))::int AS "avgMinutes"
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      p.args,
    );
    const row = rows[0] ?? {};
    const total = this.n(row.total);
    const cerrados = this.n(row.cerrados);
    const ia = this.n(row.ia);
    return {
      total,
      cerrados,
      ia,
      humano: this.n(row.humano),
      pctCierre: total ? Math.round((cerrados / total) * 100) : 0,
      pctIa: total ? Math.round((ia / total) * 100) : 0,
      clasificadas: this.n(row.clasificadas),
      avgMinutes: this.n(row.avgMinutes),
    };
  }

  private async queryRatingsKpis(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`r.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`r.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') w.push(`${PROYECTO_SESIONES} = ${p.ph(f.proyecto)}`);
    const rows = await this.dataSource.query(
      `SELECT COUNT(r.id)::int AS total, AVG(r.estrellas) AS avg
       FROM ratings r
       JOIN sessions s ON s.id = r.session_id
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`,
      p.args,
    );
    const row = rows[0] ?? {};
    const total = this.n(row.total);
    return { total, promedio: total ? this.n1(row.avg) : null };
  }

  /** Correos no tiene colegio/proyecto: aplica solo fechas y asesor. */
  private async queryCorreosKpis(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`${FECHA_CORREO} >= ${p.ph(r.start)}`);
    if (r.end) w.push(`${FECHA_CORREO} < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.asesor_id = ${p.ph(f.asesorId)}`);
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE m.is_read = false)::int AS "noLeidos"
       FROM correo_mensajes m
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`,
      p.args,
    );
    const row = rows[0] ?? {};
    return { total: this.n(row.total), noLeidos: this.n(row.noLeidos) };
  }

  /**
   * Gestión de correos para el donut del dashboard General.
   *
   * - `porCategoria`: solo cuenta lo que el asesor CLASIFICÓ a mano en el
   *   selector de gestión (`categoria_gestion`, p. ej. "Requerimiento"). Los
   *   estados de Outlook ("RESUELTO", "EN PROCESO", "ESCALADO"…) NO son
   *   gestiones asignadas y por eso NO se listan: antes se colaban porque, sin
   *   `categoria_gestion`, la clave caía a la primera marca de Outlook. Los
   *   correos sin gestión asignada no se listan. Para cada clave se muestra el
   *   TOTAL de correos de esa clave (en todas sus carpetas) y, como contexto
   *   para la leyenda, la carpeta del asesor de la que más provienen
   *   (`folder_display_name`).
   * - `resueltos` / `pendientes`: normaliza las etiquetas de Outlook de la
   *   columna `categorias` (jsonb) quitando los símbolos decorativos y
   *   comparando en mayúsculas, igual que `categoria-correo.util.ts` del
   *   frontend. "RESUELTO" cuenta como resuelto; el resto (incluido sin
   *   etiqueta) queda como pendiente.
   */
  private async queryGestionCorreos(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`${FECHA_CORREO} >= ${p.ph(r.start)}`);
    if (r.end) w.push(`${FECHA_CORREO} < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.asesor_id = ${p.ph(f.asesorId)}`);
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
    // El filtro de rango y el de "solo correos con clave" van en el mismo WHERE.
    const conClave = w.length ? `${where} AND` : 'WHERE';

    // Expresión que replica la normalización del frontend: quita los símbolos
    // iniciales con los que Outlook decora las categorías y deja el texto en
    // mayúsculas para comparar de forma estable.
    const normCat = `upper(regexp_replace(trim(x.cat), '^[\\s\\-=+*_•·✓✔☑✅❗!|#>»›.:;,]+', '', 'g'))`;

    const [porCategoria, estado] = await Promise.all([
      this.dataSource.query(
        `SELECT clave, total AS count, folder_display_name AS carpeta
         FROM (
           SELECT DISTINCT ON (clave) clave, total, folder_display_name
           FROM (
             SELECT k.clave,
                    coalesce(m.folder_display_name, '(sin carpeta)') AS folder_display_name,
                    COUNT(*)::int AS cnt,
                    SUM(COUNT(*)) OVER (PARTITION BY k.clave)::int AS total
             FROM correo_mensajes m
             CROSS JOIN LATERAL (
               SELECT nullif(trim(m.categoria_gestion), '') AS clave
             ) k
             ${conClave} k.clave IS NOT NULL
             GROUP BY 1, 2
           ) t
           ORDER BY clave, cnt DESC
         ) x
         ORDER BY total DESC`,
        p.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE resuelto)::int AS resueltos
         FROM (
           SELECT EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(
               CASE WHEN m.categorias IS NULL OR m.categorias = '' THEN '[]'::jsonb
                    ELSE m.categorias::jsonb END
             ) x(cat)
             WHERE ${normCat} = 'RESUELTO'
           ) AS resuelto
           FROM correo_mensajes m
           ${where}
         ) t`,
        p.args,
      ),
    ]);

    const total = this.n(estado[0]?.total);
    const resueltos = this.n(estado[0]?.resueltos);
    return {
      porCategoria: porCategoria.map((row: any) => ({
        clave: row.clave,
        count: this.n(row.count),
        carpeta: row.carpeta ?? null,
      })),
      resueltos,
      pendientes: total - resueltos,
      total,
    };
  }

  private async queryProyectos(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT ${PROYECTO_SESIONES} AS proyecto, COUNT(*)::int AS total
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY 1 ORDER BY 2 DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      proyecto: row.proyecto,
      total: this.n(row.total),
    }));
  }

  /** Contadores del periodo anterior (misma longitud) para las variaciones. */
  private async queryVariacionPrevia(f: Filtros, r: Rango) {
    const vacio = {
      sesiones: { total: 0, cerrados: 0, ia: 0 },
      ratings: 0,
      tickets: 0,
      correos: 0,
      reuniones: 0,
    };
    if (!r.start || !r.end) return vacio;
    const len = r.end.getTime() - r.start.getTime();
    const prev: Rango = {
      start: new Date(r.start.getTime() - len),
      end: new Date(r.start.getTime()),
      desdeStr: '',
      hastaStr: '',
    };

    const pS = new Params();
    const wS = this.whereSesiones(pS, f, prev);
    const pR = new Params();
    const wR: string[] = [];
    if (prev.start) wR.push(`r.created_at >= ${pR.ph(prev.start)}`);
    if (prev.end) wR.push(`r.created_at < ${pR.ph(prev.end)}`);
    if (f.asesorId) wR.push(`s.advisor_id = ${pR.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') wR.push(`${PROYECTO_SESIONES} = ${pR.ph(f.proyecto)}`);

    const hayProyecto = !!f.proyecto && f.proyecto !== 'all';

    // Tickets: el proyecto sale de `colegios` unido por la institución, con el
    // alias `tc` para no chocar con la tabla `tickets`).
    const pT = new Params();
    const wT: string[] = [];
    if (prev.start) wT.push(`t.created_at >= ${pT.ph(prev.start)}`);
    if (prev.end) wT.push(`t.created_at < ${pT.ph(prev.end)}`);
    if (f.asesorId) wT.push(`t.assigned_to_id = ${pT.ph(f.asesorId)}`);
    if (hayProyecto) {
      wT.push(`${PROYECTO_SESIONES.replace(/\bc\./g, 'tc.')} = ${pT.ph(f.proyecto)}`);
    }

    const pC = new Params();
    const wC: string[] = [];
    if (prev.start) wC.push(`${FECHA_CORREO} >= ${pC.ph(prev.start)}`);
    if (prev.end) wC.push(`${FECHA_CORREO} < ${pC.ph(prev.end)}`);
    if (f.asesorId) wC.push(`m.asesor_id = ${pC.ph(f.asesorId)}`);

    const [ses, rat, tic, cor, reuniones] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE s.status = 'closed')::int AS cerrados,
                COUNT(*) FILTER (WHERE s.advisor_id IS NULL)::int AS ia
         FROM sessions s
         LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
         ${wS.length ? `WHERE ${wS.join(' AND ')}` : ''}`,
        pS.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(r.id)::int AS total FROM ratings r
         JOIN sessions s ON s.id = r.session_id
         LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
         ${wR.length ? `WHERE ${wR.join(' AND ')}` : ''}`,
        pR.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM tickets t
         ${hayProyecto ? 'LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)' : ''}
         ${wT.length ? `WHERE ${wT.join(' AND ')}` : ''}`,
        pT.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM correo_mensajes m
         ${wC.length ? `WHERE ${wC.join(' AND ')}` : ''}`,
        pC.args,
      ),
      // Reuniones: mismo origen que el periodo actual (calendario en
      // memoria, app + Teams). Si esto siguiera leyendo `teams_meetings`, el %
      // compararía "actual con Teams" contra "previo solo de la app".
      this.reunionesDelRango(f, prev).then((ev) => ev.length),
    ]);

    return {
      sesiones: {
        total: this.n(ses[0]?.total),
        cerrados: this.n(ses[0]?.cerrados),
        ia: this.n(ses[0]?.ia),
      },
      ratings: this.n(rat[0]?.total),
      tickets: this.n(tic[0]?.total),
      correos: this.n(cor[0]?.total),
      reuniones,
    };
  }

  // ── Sección: tickets por estado (KPIs y donut del tab General) ────────────
  private async seccionTicketsEstado(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereTickets(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT coalesce(t.status, 'sin estado') AS clave, COUNT(*)::int AS count
       FROM tickets t
       LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1 ORDER BY 2 DESC`,
      p.args,
    );
    const porEstado = rows.map((row: any) => ({
      clave: row.clave ?? 'sin estado',
      count: this.n(row.count),
    }));
    const total = porEstado.reduce((sum: number, t) => sum + t.count, 0);
    const abiertos = porEstado
      .filter((t) => ['open', 'in_progress', 'on_hold'].includes(t.clave))
      .reduce((sum: number, t) => sum + t.count, 0);
    const resueltos = porEstado
      .filter((t) => ['resolved', 'closed'].includes(t.clave))
      .reduce((sum: number, t) => sum + t.count, 0);
    return { total, abiertos, resueltos, porEstado };
  }

  // ── Sección: tickets y correos (pestaña Tickets/Correos) ─────────────────
  /**
   * Dos niveles, igual que Atención:
   *
   * - `asesores`: nivel 1, TODOS los asesores del rol con sus conteos de
   *   tickets y correos del rango (los que no tienen nada salen en 0).
   * - `tickets` / `correos`: nivel 2, hasta 50 filas MÁS RECIENTES de CADA
   *   asesor (`ROW_NUMBER` particionado por asesor), así entrar a cualquiera
   *   de la lista siempre muestra datos.
   * - `gestionTickets` / `gestionCorreos`: conteo por categoría de GESTIÓN
   *   (el catálogo que el equipo clasifica: Requerimiento, Error, ... o
   *   «Sin clasificar»). Aquí NO aparecen estados tipo RESUELTO/PENDIENTE:
   *   solo las categorías asignadas en el selector de Gestión.
   */
  private async seccionTicketsCorreos(f: Filtros, r: Rango) {
    const [asesores, tickets, correos, gestionTickets, gestionCorreos] =
      await Promise.all([
        this.queryAsesoresTicketsCorreos(f, r),
        this.queryDetalleTicketsAsesor(f, r),
        this.queryDetalleCorreosAsesor(f, r),
        this.queryGestionTicketsPorAsesor(f, r),
        this.queryGestionCorreosPorAsesor(f, r),
      ]);
    return { asesores, tickets, correos, gestionTickets, gestionCorreos };
  }

  /** WHERE compartido por todo lo que sale de la tabla `tickets`. */
  private whereTickets(p: Params, f: Filtros, r: Rango): string[] {
    const w: string[] = [];
    if (r.start) w.push(`t.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`t.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`t.assigned_to_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') {
      w.push(`${PROYECTO_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.proyecto)}`);
    }
    return w;
  }

  /**
   * WHERE de correos. El filtro de PROYECTO no aplica (los correos no tienen
   * colegio), igual que en `queryGestionCorreos`.
   */
  private whereCorreos(p: Params, f: Filtros, r: Rango): string[] {
    const w: string[] = [];
    if (r.start) w.push(`${FECHA_CORREO} >= ${p.ph(r.start)}`);
    if (r.end) w.push(`${FECHA_CORREO} < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.asesor_id = ${p.ph(f.asesorId)}`);
    return w;
  }

  /**
   * Nivel 1: TODOS los asesores del rol con sus conteos del rango. Los que no
   * tengan tickets ni correos salen en 0: la lista tiene que ser completa
   * (así se filtra por asesor y se ve quién aún no tiene nada clasificado).
   *
   * El único `Params` se recorre en orden: primero el WHERE de tickets (CTE
   * `tk`) y después el de correos (CTE `co`), igual que se ensambla el SQL.
   */
  private async queryAsesoresTicketsCorreos(f: Filtros, r: Rango) {
    const p = new Params();
    const wt = this.whereTickets(p, f, r);
    const wc = this.whereCorreos(p, f, r);
    const rows = await this.dataSource.query(
      `WITH tk AS (
         SELECT t.assigned_to_id AS id, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE t.status IN ('open','in_progress','on_hold'))::int AS abiertos,
                COUNT(*) FILTER (WHERE t.status IN ('resolved','closed'))::int AS resueltos
         FROM tickets t
         LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
         ${wt.length ? `WHERE ${wt.join(' AND ')}` : ''}
         GROUP BY 1
       ),
       co AS (
         SELECT m.asesor_id AS id, COUNT(*)::int AS total
         FROM correo_mensajes m
         ${wc.length ? `WHERE ${wc.join(' AND ')}` : ''}
         GROUP BY 1
       )
       SELECT u.id, u.name AS asesor,
              coalesce(tk.total, 0) AS tickets,
              coalesce(tk.abiertos, 0) AS "ticketsAbiertos",
              coalesce(tk.resueltos, 0) AS "ticketsResueltos",
              coalesce(co.total, 0) AS correos
       FROM users u
       LEFT JOIN tk ON tk.id = u.id
       LEFT JOIN co ON co.id = u.id
       WHERE u.role = 'advisor'
       ORDER BY (coalesce(tk.total, 0) + coalesce(co.total, 0)) DESC, u.name ASC`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      asesor: row.asesor,
      tickets: this.n(row.tickets),
      ticketsAbiertos: this.n(row.ticketsAbiertos),
      ticketsResueltos: this.n(row.ticketsResueltos),
      correos: this.n(row.correos),
    }));
  }

  /** Conteo de TICKETS por categoría de gestión, DESPARTIDO por asesor. */
  private async queryGestionTicketsPorAsesor(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereTickets(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT t.assigned_to_id AS id,
              coalesce(nullif(trim(t.categoria_gestion), ''), 'Sin clasificar') AS clave,
              COUNT(*)::int AS count
       FROM tickets t
       LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1, 2
       ORDER BY 1, 3 DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      clave: row.clave,
      count: this.n(row.count),
    }));
  }

  /**
   * Conteo de CORREOS por categoría de gestión, DESPARTIDO por asesor.
   * Manda `categoria_gestion` (lo que el asesor clasificó en el selector de
   * Gestión); si no tiene, «Sin clasificar». Las marcas de Outlook tipo
   * RESUELTO/PENDIENTO NO entran aquí a propósito.
   */
  private async queryGestionCorreosPorAsesor(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereCorreos(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT m.asesor_id AS id,
              coalesce(nullif(trim(m.categoria_gestion), ''), 'Sin clasificar') AS clave,
              COUNT(*)::int AS count
       FROM correo_mensajes m
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1, 2
       ORDER BY 1, 3 DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      clave: row.clave,
      count: this.n(row.count),
    }));
  }

  /**
   * Nivel 2 (lado de TICKETS): los 50 tickets más recientes de CADA asesor
   * (`ROW_NUMBER` particionado) para que entrar a cualquier fila de la lista
   * del nivel 1 muestre datos, no solo a los que tienen los últimos.
   */
  private async queryDetalleTicketsAsesor(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereTickets(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT id, fecha, colegio, categoria, gestion, prioridad, estado, "resolucionMin"
       FROM (
         SELECT t.assigned_to_id AS id, t.created_at AS fecha,
                t.institucion AS colegio,
                coalesce(t.category, 'Sin categoría') AS categoria,
                coalesce(nullif(trim(t.categoria_gestion), ''), 'Sin clasificar') AS gestion,
                t.priority AS prioridad, t.status AS estado,
                ROUND(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 60)::int AS "resolucionMin",
                ROW_NUMBER() OVER (
                  PARTITION BY t.assigned_to_id ORDER BY t.created_at DESC
                ) AS rn
         FROM tickets t
         LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
         ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       ) x
       WHERE x.rn <= 50
       ORDER BY x.fecha DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      fecha: row.fecha,
      colegio: row.colegio ?? null,
      categoria: row.categoria,
      gestion: row.gestion,
      prioridad: row.prioridad,
      estado: row.estado,
      resolucionMin: row.resolucionMin == null ? null : this.n(row.resolucionMin),
    }));
  }

  /**
   * Nivel 2 (lado de CORREOS): los 50 correos más recientes de CADA asesor,
   * con su CARPETA de Outlook y la categoría de Gestión que tiene asignada
   * (o «Sin clasificar»).
   */
  private async queryDetalleCorreosAsesor(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereCorreos(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT id, fecha, asunto, carpeta, gestion
       FROM (
         SELECT m.asesor_id AS id, ${FECHA_CORREO} AS fecha,
                m.subject AS asunto,
                coalesce(m.folder_display_name, '(sin carpeta)') AS carpeta,
                coalesce(nullif(trim(m.categoria_gestion), ''), 'Sin clasificar') AS gestion,
                ROW_NUMBER() OVER (
                  PARTITION BY m.asesor_id ORDER BY ${FECHA_CORREO} DESC
                ) AS rn
         FROM correo_mensajes m
         ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       ) x
       WHERE x.rn <= 50
       ORDER BY x.fecha DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      fecha: row.fecha,
      asunto: row.asunto ?? '—',
      carpeta: row.carpeta ?? '(sin carpeta)',
      gestion: row.gestion,
    }));
  }

  // ── Sección: colegios ─────────────────────────────────────────────────────
  private async seccionColegios(f: Filtros, r: Rango) {
    const [kpis, tabla, estrellas, ticketsPorColegio] = await Promise.all([
      this.queryColegiosKpis(f, r),
      this.queryColegiosTabla(f, r),
      this.queryEstrellasPorColegio(f, r),
      this.queryTicketsPorColegio(f, r),
    ]);
    const estrellasMap = new Map<any, any>(
      estrellas.map((e: any) => [String(e.colegio).toLowerCase(), e]),
    );
    const ticketsMap = new Map<any, any>(
      ticketsPorColegio.map((t: any) => [String(t.colegio).toLowerCase(), this.n(t.total)]),
    );
    const tablaConDatos = tabla.map((row: any) => {
      const key = String(row.colegio ?? '').toLowerCase();
      const match = estrellasMap.get(key);
      return {
        ...row,
        avgEstrellas: match ? this.n1(match.avg) : null,
        ratings: match ? this.n(match.total) : 0,
        tickets: ticketsMap.get(key) ?? 0,
      };
    });
    return { kpis, tabla: tablaConDatos };
  }

  private async queryColegiosKpis(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereSesiones(p, f, r);
    w.push(`s.colegio IS NOT NULL AND s.colegio <> ''`);

    const pT = new Params();
    const wT: string[] = [];
    if (r.start) wT.push(`t.created_at >= ${pT.ph(r.start)}`);
    if (r.end) wT.push(`t.created_at < ${pT.ph(r.end)}`);
    if (f.asesorId) wT.push(`t.assigned_to_id = ${pT.ph(f.asesorId)}`);
    wT.push('tc.id IS NOT NULL');
    if (f.proyecto && f.proyecto !== 'all') {
      wT.push(`${PROYECTO_SESIONES.replace(/\bc\./g, 'tc.')} = ${pT.ph(f.proyecto)}`);
    }

    const [sesiones, tickets] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(DISTINCT s.colegio)::int AS activos
         FROM sessions s
         LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
         WHERE ${w.join(' AND ')}`,
        p.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total
         FROM tickets t
         LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
         ${wT.length ? `WHERE ${wT.join(' AND ')}` : ''}`,
        pT.args,
      ),
    ]);
    return {
      colegiosActivos: this.n(sesiones[0]?.activos),
      ticketsAsociados: this.n(tickets[0]?.total),
    };
  }

  private async queryColegiosTabla(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereSesiones(p, f, r);
    w.push(`s.colegio IS NOT NULL AND s.colegio <> ''`);
    const rows = await this.dataSource.query(
      `SELECT s.colegio AS colegio, ${PROYECTO_SESIONES} AS proyecto,
              COUNT(*)::int AS sesiones,
              COUNT(*) FILTER (WHERE s.status = 'closed')::int AS cerradas,
              COUNT(*) FILTER (WHERE s.status = 'active')::int AS activas,
              COUNT(*) FILTER (WHERE s.advisor_id IS NULL)::int AS ia,
              COUNT(*) FILTER (WHERE s.advisor_id IS NOT NULL)::int AS humano
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY s.colegio, ${PROYECTO_SESIONES}
       ORDER BY 3 DESC
       LIMIT 100`,
      p.args,
    );
    return rows.map((row: any) => ({
      colegio: row.colegio,
      proyecto: row.proyecto,
      sesiones: this.n(row.sesiones),
      cerradas: this.n(row.cerradas),
      activas: this.n(row.activas),
      ia: this.n(row.ia),
      humano: this.n(row.humano),
    }));
  }

  private async queryEstrellasPorColegio(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`r.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`r.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') w.push(`${PROYECTO_SESIONES} = ${p.ph(f.proyecto)}`);
    w.push(`s.colegio IS NOT NULL AND s.colegio <> ''`);
    const rows = await this.dataSource.query(
      `SELECT s.colegio AS colegio, COUNT(r.id)::int AS total, AVG(r.estrellas) AS avg
       FROM ratings r
       JOIN sessions s ON s.id = r.session_id
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY s.colegio
       ORDER BY 2 DESC
       LIMIT 60`,
      p.args,
    );
    return rows.map((row: any) => ({
      colegio: row.colegio,
      total: this.n(row.total),
      avg: this.n1(row.avg),
    }));
  }

  private async queryTicketsPorColegio(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`t.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`t.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`t.assigned_to_id = ${p.ph(f.asesorId)}`);
    w.push(`t.institucion IS NOT NULL AND t.institucion <> ''`);
    if (f.proyecto && f.proyecto !== 'all') {
      w.push(`${PROYECTO_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.proyecto)}`);
    }
    const rows = await this.dataSource.query(
      `SELECT t.institucion AS colegio, COUNT(*)::int AS total
       FROM tickets t
       LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
       WHERE ${w.join(' AND ')}
       GROUP BY 1 ORDER BY 2 DESC
       LIMIT 20`,
      p.args,
    );
    return rows.map((row: any) => ({
      colegio: row.colegio,
      total: this.n(row.total),
    }));
  }

  // ── Sección: atención (lista de asesores + cruce asesor × colegio) ─────────
  /**
   * Dos niveles para la pestaña Atención:
   *
   * `asesores` — TODOS los asesores activos del filtro, aunque no hayan
   * atendido nada en el rango, con cuántas sesiones cerró y en cuántos
   * colegios. Es la lista que ve el admin al entrar a la pestaña.
   *
   * `tabla` — una fila por cada par (asesor, colegio) ATENDIDO: solo sesiones
   * `closed` (atendido = el asesor finalizó la atención en cerrado). Es lo que
   * se ve al entrar a un asesor.
   *
   * No hay tabla nueva: sale de `sessions` agrupada por asesor y colegio, así
   * que el dashboard sigue sin escribir ni una fila más. `LIMIT 2000` acota el
   * viaje y `COUNT(*) OVER ()` entrega el total de pares por si se recorta.
   */
  private async queryAtencionAsesores(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereSesiones(p, f, r);
    w.push(`s.status = 'closed'`);
    w.push(`s.advisor_id IS NOT NULL`);
    w.push(`s.colegio IS NOT NULL AND s.colegio <> ''`);
    const rows = await this.dataSource.query(
      `SELECT u.id, u.name AS asesor,
              COALESCE(a.n, 0)::int AS sesiones,
              COALESCE(a.colegios, 0)::int AS colegios
       FROM users u
       LEFT JOIN (
         SELECT s.advisor_id, COUNT(*)::int AS n,
                COUNT(DISTINCT lower(s.colegio))::int AS colegios
         FROM sessions s
         LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
         WHERE ${w.join(' AND ')}
         GROUP BY 1
       ) a ON a.advisor_id = u.id
       WHERE u.role = 'advisor' AND u.active = true
       ORDER BY sesiones DESC, u.name ASC`,
      p.args,
    );
    return rows;
  }

  private async queryAtencionCruce(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereSesiones(p, f, r);
    w.push(`s.status = 'closed'`);
    w.push(`s.advisor_id IS NOT NULL`);
    w.push(`s.colegio IS NOT NULL AND s.colegio <> ''`);
    const rows = await this.dataSource.query(
      `SELECT s.advisor_id AS id, u.name AS asesor,
              s.colegio AS colegio, ${PROYECTO_SESIONES} AS proyecto,
              COUNT(*)::int AS atendidas,
              (COUNT(*) OVER ())::int AS "totalPares"
       FROM sessions s
       JOIN users u ON u.id = s.advisor_id
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY s.advisor_id, u.name, s.colegio, ${PROYECTO_SESIONES}
       ORDER BY u.name ASC, COUNT(*) DESC
       LIMIT 2000`,
      p.args,
    );
    return rows;
  }

  /** Calificaciones de los pares atendidos, para la columna ★. */
  private async queryAtencionRatings(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`r.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`r.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') {
      w.push(`${PROYECTO_SESIONES} = ${p.ph(f.proyecto)}`);
    }
    w.push(`s.status = 'closed'`);
    w.push(`s.advisor_id IS NOT NULL`);
    w.push(`s.colegio IS NOT NULL AND s.colegio <> ''`);
    const rows = await this.dataSource.query(
      `SELECT s.advisor_id AS id, s.colegio AS colegio,
              COUNT(r.id)::int AS total, AVG(r.estrellas) AS avg
       FROM ratings r
       JOIN sessions s ON s.id = r.session_id
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY s.advisor_id, s.colegio`,
      p.args,
    );
    return rows;
  }

  private async seccionAtencion(f: Filtros, r: Rango) {
    const [asesores, tabla, ratings] = await Promise.all([
      this.queryAtencionAsesores(f, r),
      this.queryAtencionCruce(f, r),
      this.queryAtencionRatings(f, r),
    ]);
    const clave = (id: unknown, colegio: unknown) =>
      `${String(id)}|${String(colegio ?? '').toLowerCase()}`;
    const ratingsMap = new Map<string, any>(
      ratings.map((x: any) => [clave(x.id, x.colegio), x]),
    );
    const filas = tabla.map((row: any) => {
      const match = ratingsMap.get(clave(row.id, row.colegio));
      return {
        id: String(row.id),
        asesor: row.asesor ?? '—',
        colegio: row.colegio,
        proyecto: row.proyecto,
        atendidas: this.n(row.atendidas),
        avgEstrellas: match && this.n(match.total) > 0 ? this.n1(match.avg) : null,
      };
    });

    // ★ de cada ASESOR en la lista: promedio ponderado por la cantidad de
    // calificaciones de sus pares (solo pares que sí están en la tabla).
    const clavesPares = new Set(tabla.map((row: any) => clave(row.id, row.colegio)));
    const porAsesor = new Map<string, { total: number; suma: number }>();
    for (const x of ratings as any[]) {
      if (!clavesPares.has(clave(x.id, x.colegio))) continue;
      const total = this.n(x.total);
      if (total <= 0) continue;
      const e = porAsesor.get(String(x.id)) ?? { total: 0, suma: 0 };
      e.total += total;
      e.suma += this.n(x.avg) * total;
      porAsesor.set(String(x.id), e);
    }

    const lista = (asesores as any[]).map((row) => {
      const e = porAsesor.get(String(row.id));
      return {
        id: String(row.id),
        asesor: row.asesor ?? '—',
        sesiones: this.n(row.sesiones),
        colegios: this.n(row.colegios),
        avgEstrellas: e && e.total > 0 ? this.n1(e.suma / e.total) : null,
      };
    });

    return {
      asesores: lista,
      tabla: filas,
      tablaTotal: this.n(tabla[0]?.totalPares ?? filas.length),
    };
  }

  // ── Sección: asesoría ─────────────────────────────────────────────────────
  private async seccionAsesoria(f: Filtros, r: Rango) {
    const [kpiBase, tabla, ratings, ticketsPorAsesor] = await Promise.all([
      this.querySesionesKpis(f, r),
      this.queryAsesoresTabla(f, r),
      this.queryRatingsPorAsesor(f, r),
      this.queryTicketsPorAsesor(f, r),
    ]);

    const ratingsMap = new Map<any, any>(ratings.map((x: any) => [x.id, x]));
    const ticketsMap = new Map<any, any>(
      ticketsPorAsesor.map((x: any) => [x.id, this.n(x.total)]),
    );
    const tablaEnriquecida = tabla.map((row: any) => {
      const rt = ratingsMap.get(row.id);
      return {
        ...row,
        avgEstrellas: rt && this.n(rt.total) > 0 ? this.n1(rt.avg) : null,
        ratings: rt ? this.n(rt.total) : 0,
        tickets: ticketsMap.get(row.id) ?? 0,
        pctDelTotal: kpiBase.total
          ? Math.round((row.atendidas / kpiBase.total) * 100)
          : 0,
      };
    });

    return {
      kpis: {
        asesoresActivos: tablaEnriquecida.filter((x: any) => x.atendidas > 0).length,
        cerrados: tablaEnriquecida.reduce((s: number, x: any) => s + x.cerrados, 0),
        activos: tablaEnriquecida.reduce((s: number, x: any) => s + x.activos, 0),
      },
      tabla: tablaEnriquecida,
    };
  }

  /**
   * Tabla de asesores para el dashboard y la pestaña Asesoría.
   *
   * Se parte de `users` (solo rol `advisor`, activos) con LEFT JOIN a las
   * sesiones del rango: así listan TODOS los asesores, incluso los que no
   * atendieron chats en el periodo (aparecen con 0 en todas las columnas).
   *
   * Con filtro de proyecto cambia a INNER JOIN y se agrega el JOIN de `colegios`,
   * que es de donde sale el proyecto (`PROYECTO_SESIONES` referencia `c.tipo_colegio`):
   * solo listan los asesores con sesiones de ese proyecto en el rango, y el SQL
   * deja de romperse por usar `c` sin declararlo.
   *
   * Orden: primero quienes tienen más atención, y al final los sin actividad.
   */
  private async queryAsesoresTabla(f: Filtros, r: Rango) {
    const p = new Params();
    const hayProyecto = !!f.proyecto && f.proyecto !== 'all';

    // Las fechas/asesor van en el ON para no descartar asesores sin actividad.
    const on: string[] = [];
    if (r.start) on.push(`s.created_at >= ${p.ph(r.start)}`);
    if (r.end) on.push(`s.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) on.push(`s.advisor_id = ${p.ph(f.asesorId)}`);

    // El proyecto va en el WHERE y exige INNER JOIN: pide sesiones de ese proyecto.
    const where: string[] = [];
    if (hayProyecto) where.push(`${PROYECTO_SESIONES} = ${p.ph(f.proyecto)}`);

    const rows = await this.dataSource.query(
      `SELECT u.id, u.name AS nombre,
              COUNT(s.id)::int AS atendidas,
              COUNT(s.id) FILTER (WHERE s.status = 'closed')::int AS cerrados,
              COUNT(s.id) FILTER (WHERE s.status = 'active')::int AS activos,
              ROUND(AVG(EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)
                FILTER (WHERE s.status = 'closed' AND s.closed_at IS NOT NULL))::int AS "avgMinutes"
       FROM users u
       ${hayProyecto ? 'INNER JOIN' : 'LEFT JOIN'} sessions s
         ON s.advisor_id = u.id
        ${on.length ? `AND ${on.join(' AND ')}` : ''}
       ${hayProyecto ? 'LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)' : ''}
       WHERE u.role = 'advisor' AND u.active = true
         ${f.asesorId ? `AND u.id = ${p.ph(f.asesorId)}` : ''}
         ${where.length ? `AND ${where.join(' AND ')}` : ''}
       GROUP BY u.id, u.name
       ORDER BY COUNT(s.id) DESC, u.name ASC`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      nombre: row.nombre ?? '—',
      atendidas: this.n(row.atendidas),
      cerrados: this.n(row.cerrados),
      activos: this.n(row.activos),
      avgMinutes: row.avgMinutes == null ? null : this.n(row.avgMinutes),
    }));
  }

  private async queryRatingsPorAsesor(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`r.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`r.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') w.push(`${PROYECTO_SESIONES} = ${p.ph(f.proyecto)}`);
    w.push('s.advisor_id IS NOT NULL');
    const rows = await this.dataSource.query(
      `SELECT s.advisor_id AS id, COUNT(r.id)::int AS total, AVG(r.estrellas) AS avg
       FROM ratings r
       JOIN sessions s ON s.id = r.session_id
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY s.advisor_id`,
      p.args,
    );
    return rows;
  }

  private async queryTicketsPorAsesor(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`t.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`t.created_at < ${p.ph(r.end)}`);
    w.push('t.assigned_to_id IS NOT NULL');
    if (f.asesorId) w.push(`t.assigned_to_id = ${p.ph(f.asesorId)}`);
    if (f.proyecto && f.proyecto !== 'all') {
      w.push(`${PROYECTO_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.proyecto)}`);
    }
    const rows = await this.dataSource.query(
      `SELECT t.assigned_to_id AS id, COUNT(*)::int AS total
       FROM tickets t
       LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1`,
      p.args,
    );
    return rows;
  }

  // ── Sección: reuniones ───────────────────────────────────────────────
  /**
   * Reuniones del rango elegido, con los filtros de proyecto y asesor aplicados.
   *
   * La fuente NO es `teams_meetings`: esa tabla solo guarda las reuniones
   * creadas desde la app. Las que el organizador arma directo en Teams/Outlook
   * solo existen en el calendario M365. Contarlas requeriria sincronizarlas a
   * BD, y aqui NO se hace: se leen del calendario en memoria
   * (`CalendarWarmService`), que ya trae ambas sin escribir una sola fila.
   *
   * Devuelve la lista ya ordenada ascendentemente, para que tabla, gráficos y
   * Excel compartan el mismo orden cronológico en vez de "lo último primero".
   */
  private async reunionesDelRango(f: Filtros, r: Rango) {
    // Sin rango explícito se acota a una ventana alrededor de hoy: pedirle a
    // Graph un rango abierto esforzaría calendarView sin aportar nada.
    const ahora = Date.now();
    const desde = (r.start ?? new Date(ahora - 30 * DIA_MS)).toISOString();
    const hasta = (r.end ?? new Date(ahora + 60 * DIA_MS)).toISOString();

    const dto = await this.warm.asegurar(desde, hasta);

    const inicio = r.start ? r.start.getTime() : -Infinity;
    const fin = r.end ? r.end.getTime() : Infinity;
    const proyecto = f.proyecto && f.proyecto !== 'all' ? f.proyecto : null;

    const eventos = (dto.eventos ?? []).filter((e) => {
      const t = new Date(e.startDateTime).getTime();
      if (!Number.isFinite(t) || t < inicio || t >= fin) return false;
      if (f.asesorId && e.createdById !== f.asesorId) return false;
      if (proyecto && proyectoDeTipoColegio(e.tipoColegio) !== proyecto) return false;
      return true;
    });

    return eventos.sort(
      (a, b) => Date.parse(a.startDateTime) - Date.parse(b.startDateTime),
    );
  }

  private aFilaTabla(e: EventoCalendarioDto) {
    return {
      id: e.meetingRecordId ?? e.eventId,
      subject: e.subject,
      startDateTime: e.startDateTime,
      modalidad: e.modalidad === 'presencial' ? 'presencial' : 'virtual',
      // Tipo completo del evento: es lo que decide el color en el front.
      categoria: e.categoria,
      proyecto: proyectoDeTipoColegio(e.tipoColegio),
      organizador: e.organizerName ?? e.organizerEmail ?? '—',
      duracion: this.n(e.durationMinutes),
      joinUrl: e.joinUrl ?? null,
      // Korvix = creada desde la app (se pudo escoger colegio); Teams = creada
      // directo en Outlook, sin colegio asociado.
      origen: e.creadaEnLaApp ? 'Korvix' : 'Teams',
    };
  }

  private aLista(m: Map<string, number>) {
    return [...m.entries()]
      .map(([clave, count]) => ({ clave, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Sección de reuniones completa, calculada en memoria sobre
   * `reunionesDelRango`: KPIs, gráficos, tabla paginada y "próximas" salen del
   * mismo array, así que no pueden discrepar entre sí.
   */
  private async seccionReuniones(
    f: Filtros,
    r: Rango,
    pagina = 1,
    tam = TABLA_PAGINA_REUNIONES,
  ) {
    const eventos = await this.reunionesDelRango(f, r);
    const ahora = Date.now();

    let virtuales = 0;
    let presenciales = 0;
    let proximas = 0;
    // Agrupa por la categoria COMPLETA (cumpleanos, vacaciones, incapacidad...)
    // y no por modalidad: el Calendario pinta siete tipos con siete colores y
    // Metricas debe repartirlos igual. Si se agrupara por modalidad, un
    // cumpleanos caeria en "virtual" y el donut lo pintaria amarillo.
    const porCategoria = new Map<string, number>();

    for (const e of eventos) {
      const categoria = e.categoria;
      if (categoria === 'Reunion virtual') virtuales++;
      else if (categoria === 'Reunion presencial') presenciales++;
      porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);

      if (new Date(e.startDateTime).getTime() > ahora) proximas++;
    }

    const total = eventos.length;
    const paginas = Math.max(1, Math.ceil(total / tam));
    const paginaOk = Math.min(Math.max(1, Math.round(pagina)), paginas);
    const desdeIndice = (paginaOk - 1) * tam;
    const tabla = eventos
      .slice(desdeIndice, desdeIndice + tam)
      .map((e) => this.aFilaTabla(e));

    // Próximas: del MISMO array ya ordenado ascendentemente, así que el conteo
    // y la lista no pueden discrepar. Se recortan a las primeras N porque es
    // una tarjeta lateral, no un listado completo.
    const proximasLista = eventos
      .filter((e) => new Date(e.startDateTime).getTime() > ahora)
      .slice(0, PROXIMAS_LISTA_MAX)
      .map((e) => this.aFilaTabla(e));

    return {
      kpis: { total, virtuales, presenciales },
      porCategoria: this.aLista(porCategoria),
      tabla,
      tablaTotal: total,
      tablaPagina: paginaOk,
      tablaPaginas: paginas,
      proximas,
      proximasLista,
    };
  }

  // ── Sección: solicitudes ──────────────────────────────────────────────────
  private async seccionSolicitudes(f: Filtros, r: Rango) {
    const [distribucion, serie, porColegio, kpiBase, previa] = await Promise.all([
      this.querySolicitudesGroup(f, r),
      this.querySolicitudesSerie(f, r),
      this.querySolicitudesPorColegio(f, r),
      this.querySesionesKpis(f, r),
      this.querySolicitudesPrevias(f, r),
    ]);
    const prevMap = new Map<any, any>(
      previa.map((row: any) => [row.clave, this.n(row.count)]),
    );
    const total = distribucion.reduce((s: number, x: any) => s + x.count, 0);
    const conVariacion = distribucion.map((row: any) => ({
      ...row,
      pct: total ? Math.round((row.count / total) * 100) : 0,
      variacion: prevMap.has(row.clave)
        ? this.pct(row.count, prevMap.get(row.clave) as number)
        : null,
    }));
    const top = conVariacion[0]?.clave ?? null;
    // El total del MES ANTERIOR (mismo tramo de días corrido un mes atrás):
    // la comparación que pide el negocio es "vs. mes anterior", no contra el
    // período previo inmediato de la misma longitud.
    const prevTotal = previa.reduce((s: number, x: any) => s + this.n(x.count), 0);
    return {
      kpis: {
        total,
        topTipo: top,
        pctClasificadas: kpiBase.total
          ? Math.round((kpiBase.clasificadas / kpiBase.total) * 100)
          : 0,
        clasificadas: kpiBase.clasificadas,
        vsMesAnterior: this.pct(total, prevTotal),
      },
      distribucion: conVariacion,
      serie,
      porColegio,
    };
  }

  /**
   * Mismo tramo de días del rango corrido un MES hacia atrás, acotado al
   * último día del mes corto (1–31 oct → 1–30 sep; 31 oct → 30 sep; 1 nov →
   * 1 oct). Así «vs. mes anterior» compara contra el mes de calendario que
   * corresponde y no se desalinea como el período previo de la misma longitud.
   */
  private rangoMesAnterior(r: Rango): Rango | null {
    if (!r.start || !r.end) return null;
    const retro = (d: Date): Date => {
      const x = new Date(d.getTime());
      const mes = x.getMonth() - 1;
      const ultimo = new Date(x.getFullYear(), mes + 1, 0).getDate();
      return new Date(x.getFullYear(), mes, Math.min(x.getDate(), ultimo));
    };
    return { start: retro(r.start), end: retro(r.end), desdeStr: '', hastaStr: '' };
  }

  private async querySolicitudesGroup(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    where.push(`s.tipo_solicitud IS NOT NULL AND s.tipo_solicitud <> ''`);
    const rows = await this.dataSource.query(
      `SELECT s.tipo_solicitud AS clave, COUNT(*)::int AS count
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${where.join(' AND ')}
       GROUP BY 1 ORDER BY 2 DESC
       LIMIT 15`,
      p.args,
    );
    return rows.map((row: any) => ({
      clave: row.clave,
      count: this.n(row.count),
    }));
  }

  private async querySolicitudesPrevias(f: Filtros, r: Rango) {
    // Mes anterior (ver rangoMesAnterior): no el período previo de la misma
    // longitud, que es lo que comparaba antes y no coincide con el calendario.
    const prev = this.rangoMesAnterior(r);
    if (!prev) return [];
    const p = new Params();
    const where = this.whereSesiones(p, f, prev);
    where.push(`s.tipo_solicitud IS NOT NULL AND s.tipo_solicitud <> ''`);
    const rows = await this.dataSource.query(
      `SELECT s.tipo_solicitud AS clave, COUNT(*)::int AS count
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${where.join(' AND ')}
       GROUP BY 1`,
      p.args,
    );
    return rows.map((row: any) => ({ clave: row.clave, count: this.n(row.count) }));
  }

  private async querySolicitudesSerie(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    where.push(`s.tipo_solicitud IS NOT NULL AND s.tipo_solicitud <> ''`);
    const rows = await this.dataSource.query(
      `SELECT to_char(s.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS fecha,
              COUNT(*)::int AS count
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${where.join(' AND ')}
       GROUP BY 1 ORDER BY 1`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      count: this.n(row.count),
    }));
  }

  /**
   * Estadística por colegios: cuáles han solicitado más en el rango, con el
   * tipo de solicitud que más repiten. Una sola consulta trae los pares
   * colegio × tipo y se agrega en memoria (total por colegio + tipo ganador),
   * devolviendo el top 100 de colegios.
   */
  private async querySolicitudesPorColegio(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    where.push(`s.tipo_solicitud IS NOT NULL AND s.tipo_solicitud <> ''`);
    const rows = await this.dataSource.query(
      `SELECT NULLIF(TRIM(s.colegio), '') AS colegio,
              s.tipo_solicitud AS tipo,
              COUNT(*)::int AS count
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${where.join(' AND ')}
       GROUP BY 1, 2
       ORDER BY 3 DESC
       LIMIT 400`,
      p.args,
    );
    const mapa = new Map<
      string,
      { colegio: string; count: number; top: number; topTipo: string | null }
    >();
    for (const row of rows) {
      const colegio = (row.colegio ?? '') as string;
      if (!colegio) continue;
      const count = this.n(row.count);
      const cur = mapa.get(colegio) ?? { colegio, count: 0, top: 0, topTipo: null };
      cur.count += count;
      if (count > cur.top) {
        cur.top = count;
        cur.topTipo = (row.tipo ?? null) as string | null;
      }
      mapa.set(colegio, cur);
    }
    return [...mapa.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 100)
      .map(({ colegio, count, topTipo }) => ({ colegio, count, topTipo }));
  }

  // ── Sección: conexiones por agente ────────────────────────────────────────
  private async seccionConexiones(f: Filtros, r: Rango) {
    const esUnDia = r.desdeStr === r.hastaStr;
    const [tabla, porDia, barras, minutosPorDia] = await Promise.all([
      this.queryConexionesTabla(f, r),
      this.queryDesconexionesPorDia(f, r),
      esUnDia ? this.queryConexionesBarras(f, r) : Promise.resolve(null),
      this.queryMinutosPorDia(f, r),
    ]);
    const sum = (campo: string) =>
      tabla.reduce((s: number, x: any) => s + this.n(x[campo]), 0);
    const disponibleMin = sum('disponibleMin');
    const ocupadoMin = sum('ocupadoMin');
    const reunionMin = sum('reunionMin');
    const almuerzoMin = sum('almuerzoMin');
    const inactivoMin = sum('inactivoMin');
    const totalMin =
      disponibleMin + ocupadoMin + reunionMin + almuerzoMin + inactivoMin;
    const kpis = {
      disponibleMin,
      ocupadoMin,
      reunionMin,
      almuerzoMin,
      inactivoMin,
      desconexiones: sum('desconexiones'),
      // Seguimiento: tiempo en línea vs. caído y % de disponibilidad
      // (Disponible sobre el tiempo productivo: total sin Almuerzo).
      totalMin,
      conectadoMin: totalMin - inactivoMin,
      desconectadoMin: inactivoMin,
      disponibilidadPct: this.pctRatio(disponibleMin, totalMin - almuerzoMin),
    };
    return {
      kpis,
      distribucion: [
        { estado: 'Disponible', minutos: kpis.disponibleMin },
        { estado: 'Ocupado', minutos: kpis.ocupadoMin },
        { estado: 'Reuniones', minutos: kpis.reunionMin },
        { estado: 'Almuerzo', minutos: kpis.almuerzoMin },
        { estado: 'Inactivo', minutos: kpis.inactivoMin },
      ].filter((x) => x.minutos > 0),
      porDia,
      minutosPorDia,
      tabla,
      barras,
    };
  }

  /**
   * Barras de conexión del asesor (estilo historial Advisors) para el dashboard.
   * Solo tiene sentido con un rango de UN día; si el rango es mayor se devuelve
   * `null` y el frontend muestra el placeholder "Ver información independiente".
   *
   * Devuelve por asesor los periodos del día (con `desde`, `hasta`, `estado` y
   * `almuerzo`), más la primera y última marca de actividad, para que el
   * frontend pinte la barra inicio–fin segmentada por estado. Los asesores sin
   * actividad en el día aparecen con `periodos: []`.
   */
  private async queryConexionesBarras(f: Filtros, r: Rango) {
    const p = new Params();
    const desde = p.ph(r.desdeStr);
    const hasta = p.ph(r.hastaStr);
    const clipIni = p.ph(r.start ?? new Date(0));
    const clipFin = p.ph(r.end ?? new Date());
    const userPh = f.asesorId ? p.ph(f.asesorId) : null;
    const rows = await this.dataSource.query(
      `WITH ev AS (
         SELECT user_id, estado, almuerzo, tipo, desde,
                LEAD(desde) OVER (PARTITION BY user_id ORDER BY desde) AS sig
         FROM advisor_activity_log
         WHERE fecha >= ${desde} AND fecha <= ${hasta}
       ),
       seg AS (
         SELECT user_id,
                CASE WHEN almuerzo THEN 'almuerzo'
                     ELSE coalesce(estado, 'offline') END AS bucket,
                GREATEST(desde, ${clipIni}) AS ini,
                LEAST(COALESCE(sig, now()), ${clipFin}) AS fin,
                desde AS marca
         FROM ev
         WHERE (sig IS NULL OR sig > ${clipIni})
       )
       SELECT s.user_id AS id, u.name AS nombre,
              s.bucket, s.ini, s.fin, s.marca
       FROM seg s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.fin > s.ini ${userPh ? `AND s.user_id = ${userPh}` : ''}
       ORDER BY u.name ASC, s.ini ASC`,
      p.args,
    );

    // Lista completa de asesores activos para que los sin actividad también se
    // dibujen (con 0 periodos), igual que en la tabla de conexiones. Se usa un
    // Params aparte para no reutilizar los placeholders de la query anterior.
    const pu = new Params();
    const userPhU = f.asesorId ? pu.ph(f.asesorId) : null;
    const asesores = await this.dataSource.query(
      `SELECT u.id, u.name AS nombre
       FROM users u
       WHERE u.active = true AND u.role = 'advisor'
         ${userPhU ? `AND u.id = ${userPhU}` : ''}
       ORDER BY u.name ASC`,
      pu.args,
    );

    const porId = new Map<string, any>();
    for (const a of asesores) {
      porId.set(String(a.id), {
        id: a.id,
        nombre: a.nombre,
        periodos: [],
        primera: null,
        ultima: null,
      });
    }
    for (const row of rows) {
      const key = String(row.id);
      const asesor = porId.get(key) ?? {
        id: row.id,
        nombre: row.nombre,
        periodos: [],
        primera: null,
        ultima: null,
      };
      asesor.periodos.push({
        desde: row.ini,
        hasta: row.fin,
        estado: row.bucket,
      });
      const marca = row.marca;
      if (!asesor.primera || marca < asesor.primera) asesor.primera = marca;
      if (!asesor.ultima || marca > asesor.ultima) asesor.ultima = marca;
      porId.set(key, asesor);
    }

    return {
      fecha: r.desdeStr,
      asesores: [...porId.values()].filter(
        (a) => a.periodos.length > 0 || !f.asesorId,
      ),
    };
  }

  /**
   * Minutos por estado, derivados de los periodos de `advisor_activity_log`
   * (el evento mantiene su estado hasta el siguiente; LEAD lo calcula en SQL).
   * Duración "registrada" entre eventos, recortada al rango; el último
   * periodo abierto se corta en `now()` o en el fin del rango.
   *
   * Se parten de `users` (asesores activos) con LEFT JOIN a los segmentos: un
   * asesor sin actividad en el rango aparece con 0s en todas las columnas, en
   * vez de no aparecer. Así el admin siempre ve la lista completa de agentes.
   */
  private async queryConexionesTabla(f: Filtros, r: Rango) {
    const p = new Params();
    const desde = p.ph(r.desdeStr);
    const hasta = p.ph(r.hastaStr);
    const clipIni = p.ph(r.start ?? new Date(0));
    const clipFin = p.ph(r.end ?? new Date());
    const userPh = f.asesorId ? p.ph(f.asesorId) : null;
    const rows = await this.dataSource.query(
      `WITH ev AS (
         SELECT user_id, estado, almuerzo, tipo, desde,
                LEAD(desde) OVER (PARTITION BY user_id ORDER BY desde) AS sig
         FROM advisor_activity_log
         WHERE fecha >= ${desde} AND fecha <= ${hasta}
       ),
       seg AS (
         SELECT user_id,
                CASE WHEN almuerzo THEN 'almuerzo'
                     ELSE coalesce(estado, 'offline') END AS bucket,
                GREATEST(desde, ${clipIni}) AS ini,
                LEAST(COALESCE(sig, now()), ${clipFin}) AS fin
         FROM ev
         WHERE (sig IS NULL OR sig > ${clipIni})
       ),
       mins AS (
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
         GROUP BY user_id
       ),
       des AS (
         SELECT user_id, COUNT(*)::int AS n
         FROM advisor_activity_log
         WHERE fecha >= ${desde} AND fecha <= ${hasta} AND tipo = 'desconexion'
         GROUP BY user_id
       )
       SELECT u.id, u.name AS nombre,
              COALESCE(m."disponibleMin", 0) AS "disponibleMin",
              COALESCE(m."ocupadoMin", 0) AS "ocupadoMin",
              COALESCE(m."reunionMin", 0) AS "reunionMin",
              COALESCE(m."almuerzoMin", 0) AS "almuerzoMin",
              COALESCE(m."inactivoMin", 0) AS "inactivoMin",
              COALESCE(d.n, 0)::int AS desconexiones
       FROM users u
       LEFT JOIN mins m ON m.user_id = u.id
       LEFT JOIN des d ON d.user_id = u.id
       WHERE u.active = true AND u.role = 'advisor'
         ${userPh ? `AND u.id = ${userPh}` : ''}
       ORDER BY 4 DESC, 5 DESC, u.name ASC`,
      p.args,
    );
    const p2 = new Params();
    const w2: string[] = [
      `a.fecha >= ${p2.ph(r.desdeStr)}`,
      `a.fecha <= ${p2.ph(r.hastaStr)}`,
      `a.tipo = 'conexion'`,
    ];
    if (f.asesorId) w2.push(`a.user_id = ${p2.ph(f.asesorId)}`);
    const conexion = await this.dataSource.query(
      `SELECT a.user_id AS id, MIN(a.desde) AS primera, MAX(a.desde) AS ultima
       FROM advisor_activity_log a
       WHERE ${w2.join(' AND ')}
       GROUP BY a.user_id`,
      p2.args,
    );
    const mapa = new Map<any, any>(conexion.map((row: any) => [row.id, row]));
    return rows.map((row: any) => {
      const c = mapa.get(row.id);
      return {
        id: row.id,
        nombre: row.nombre ?? '—',
        disponibleMin: this.n(row.disponibleMin),
        ocupadoMin: this.n(row.ocupadoMin),
        reunionMin: this.n(row.reunionMin),
        almuerzoMin: this.n(row.almuerzoMin),
        inactivoMin: this.n(row.inactivoMin),
        desconexiones: this.n(row.desconexiones),
        primeraConexion: c?.primera ?? null,
        ultimaConexion: c?.ultima ?? null,
      };
    });
  }

  private async queryDesconexionesPorDia(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [
      `fecha >= ${p.ph(r.desdeStr)}`,
      `fecha <= ${p.ph(r.hastaStr)}`,
      `tipo = 'desconexion'`,
    ];
    if (f.asesorId) w.push(`user_id = ${p.ph(f.asesorId)}`);
    const rows = await this.dataSource.query(
      `SELECT fecha, COUNT(*)::int AS count FROM advisor_activity_log
       WHERE ${w.join(' AND ')}
       GROUP BY fecha ORDER BY fecha`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      count: this.n(row.count),
    }));
  }

  /**
   * Minutos por estado, día a día (barras apiladas "Minutos por día").
   * Mismo CTE de segmentos que la tabla de conexiones, agrupado por `fecha`.
   * Los días sin actividad NO aparecen; el frontend los rellena con 0.
   */
  private async queryMinutosPorDia(f: Filtros, r: Rango) {
    const p = new Params();
    const desde = p.ph(r.desdeStr);
    const hasta = p.ph(r.hastaStr);
    const clipIni = p.ph(r.start ?? new Date(0));
    const clipFin = p.ph(r.end ?? new Date());
    const userPh = f.asesorId ? p.ph(f.asesorId) : null;
    const rows = await this.dataSource.query(
      `WITH ev AS (
         SELECT user_id, fecha, estado, almuerzo, desde,
                LEAD(desde) OVER (PARTITION BY user_id ORDER BY desde) AS sig
         FROM advisor_activity_log
         WHERE fecha >= ${desde} AND fecha <= ${hasta}
           ${userPh ? `AND user_id = ${userPh}` : ''}
       ),
       seg AS (
         SELECT fecha,
                CASE WHEN almuerzo THEN 'almuerzo'
                     ELSE coalesce(estado, 'offline') END AS bucket,
                GREATEST(desde, ${clipIni}) AS ini,
                LEAST(COALESCE(sig, now()), ${clipFin}) AS fin
         FROM ev
         WHERE (sig IS NULL OR sig > ${clipIni})
       )
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
                FILTER (WHERE fin > ini
                  AND bucket NOT IN ('online', 'busy', 'meeting', 'almuerzo')), 0))::int AS "inactivoMin"
       FROM seg
       WHERE fin > ini
       GROUP BY fecha
       ORDER BY fecha`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      disponibleMin: this.n(row.disponibleMin),
      ocupadoMin: this.n(row.ocupadoMin),
      reunionMin: this.n(row.reunionMin),
      almuerzoMin: this.n(row.almuerzoMin),
      inactivoMin: this.n(row.inactivoMin),
    }));
  }

  // ── Endpoints de seguimiento de conexiones ─────────────────────────────────

  /**
   * Línea de tiempo de UN día (`fecha=YYYY-MM-DD`), para todos los asesores o
   * solo uno con `asesorId`. Misma forma que `barras` del dashboard, pero
   * accesible aparte para cambiar de día sin recargar el dashboard completo.
   */
  async conexionesDia(f: Filtros & { fecha?: string }) {
    const fecha = String(f.fecha ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException(
        'La fecha es obligatoria y debe tener formato YYYY-MM-DD',
      );
    }
    const cacheKey = `${this.CACHE_PREFIX}conn-dia:${fecha}:${f.asesorId ?? ''}`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch {
      // La caché es opcional: si falla, se consulta la BD.
    }
    const r = this.rango({ ...f, desde: fecha, hasta: fecha });
    const result = await this.queryConexionesBarras(f, r);
    try {
      await this.cache.set(cacheKey, result, 30_000);
    } catch {
      // La caché es opcional: si falla, se ignora.
    }
    return result;
  }

  /**
   * Ficha de seguimiento de UN asesor en el rango: historial de eventos con
   * hora, duración y causa (lo que pide el admin para auditar desconexiones),
   * más el resumen por día y los KPIs del agente.
   */
  async conexionesHistorial(f: Filtros) {
    if (!f.asesorId) {
      throw new BadRequestException('Falta el asesor (asesorId)');
    }
    const r = this.rango(f);
    const cacheKey = `${this.CACHE_PREFIX}conn-hist:${f.asesorId}:${r.desdeStr}:${r.hastaStr}`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch {
      // La caché es opcional: si falla, se consulta la BD.
    }

    const [eventos, porDiaMin, porDiaCortes, corte] = await Promise.all([
      this.queryConexionEventos(f.asesorId, r),
      this.queryMinutosPorDia(f, r),
      this.queryDesconexionesPorDia(f, r),
      this.queryConexionCortes(f.asesorId, r),
    ]);

    // Resumen por día: minutos por estado + desconexiones de ese día.
    const cortesPorDia = new Map<string, number>(
      porDiaCortes.map((d: any) => [String(d.fecha), d.count]),
    );
    const dias = porDiaMin.map((d) => ({
      ...d,
      desconexiones: cortesPorDia.get(String(d.fecha)) ?? 0,
    }));

    const sum = (campo: string) =>
      dias.reduce((s: number, d: any) => s + this.n(d[campo]), 0);
    const disponibleMin = sum('disponibleMin');
    const ocupadoMin = sum('ocupadoMin');
    const reunionMin = sum('reunionMin');
    const almuerzoMin = sum('almuerzoMin');
    const inactivoMin = sum('inactivoMin');
    const totalMin =
      disponibleMin + ocupadoMin + reunionMin + almuerzoMin + inactivoMin;
    const kpis = {
      disponibleMin,
      ocupadoMin,
      reunionMin,
      almuerzoMin,
      inactivoMin,
      totalMin,
      conectadoMin: totalMin - inactivoMin,
      desconectadoMin: inactivoMin,
      disponibilidadPct: this.pctRatio(disponibleMin, totalMin - almuerzoMin),
      desconexiones: sum('desconexiones'),
      // Duración real de los cortes (evento `desconexion` hasta el siguiente).
      corteTotalMin: corte.totalMin,
      cortePromMin: corte.promMin,
      dias: dias.length,
    };

    const result = { kpis, dias, eventos };
    try {
      await this.cache.set(cacheKey, result, 30_000);
    } catch {
      // La caché es opcional: si falla, se ignora.
    }
    return result;
  }

  /**
   * Historial de eventos del asesor con duración calculada (LEAD) y recorte al
   * rango. Orden descendente (lo más reciente primero), tope de 1000 filas.
   */
  private async queryConexionEventos(asesorId: string, r: Rango) {
    const p = new Params();
    const user = p.ph(asesorId);
    const desde = p.ph(r.desdeStr);
    const hasta = p.ph(r.hastaStr);
    const clipIni = p.ph(r.start ?? new Date(0));
    const clipFin = p.ph(r.end ?? new Date());
    const rows = await this.dataSource.query(
      `WITH ev AS (
         SELECT estado, almuerzo, tipo, causa, fecha, desde,
                LEAD(desde) OVER (ORDER BY desde) AS sig
         FROM advisor_activity_log
         WHERE user_id = ${user} AND fecha >= ${desde} AND fecha <= ${hasta}
       ),
       seg AS (
         SELECT fecha, tipo, causa,
                CASE WHEN almuerzo THEN 'almuerzo'
                     ELSE coalesce(estado, 'offline') END AS estado,
                desde,
                GREATEST(desde, ${clipIni}) AS ini,
                LEAST(COALESCE(sig, now()), ${clipFin}) AS fin
         FROM ev
         WHERE (sig IS NULL OR sig > ${clipIni})
       )
       SELECT fecha, desde, fin AS hasta, estado, tipo, causa,
              ROUND(EXTRACT(EPOCH FROM (fin - ini)) * 1000)::bigint AS "duracionMs"
       FROM seg
       WHERE fin > ini
       ORDER BY desde DESC
       LIMIT 1000`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      desde: row.desde,
      hasta: row.hasta,
      estado: row.estado,
      tipo: row.tipo,
      causa: row.causa ?? null,
      duracionMs: this.n(row.duracionMs),
    }));
  }

  /** Total y promedio (min) de los cortes reales: `tipo = 'desconexion'`. */
  private async queryConexionCortes(asesorId: string, r: Rango) {
    const p = new Params();
    const user = p.ph(asesorId);
    const desde = p.ph(r.desdeStr);
    const hasta = p.ph(r.hastaStr);
    const clipIni = p.ph(r.start ?? new Date(0));
    const clipFin = p.ph(r.end ?? new Date());
    const rows = await this.dataSource.query(
      `WITH ev AS (
         SELECT tipo, desde,
                LEAD(desde) OVER (ORDER BY desde) AS sig
         FROM advisor_activity_log
         WHERE user_id = ${user} AND fecha >= ${desde} AND fecha <= ${hasta}
       )
       SELECT COUNT(*)::int AS cortes,
              ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (
                LEAST(COALESCE(sig, now()), ${clipFin}) - GREATEST(desde, ${clipIni})
              )) / 60), 0))::int AS "totalMin"
       FROM ev
       WHERE tipo = 'desconexion'
         AND (sig IS NULL OR sig > ${clipIni})
         AND LEAST(COALESCE(sig, now()), ${clipFin}) > GREATEST(desde, ${clipIni})`,
      p.args,
    );
    const row = rows[0] ?? {};
    const cortes = this.n(row.cortes);
    const totalMin = this.n(row.totalMin);
    return {
      cortes,
      totalMin,
      promMin: cortes ? Math.round(totalMin / cortes) : null,
    };
  }

  // ── Exportación Excel ─────────────────────────────────────────────────────
  async exportDashboard(filtros: Filtros): Promise<Buffer> {
    const dash = (await this.getDashboard(filtros)) as any;
    const wb = new ExcelJS.Workbook();

    const estilo = (ws: ExcelJS.Worksheet) => {
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });
    };
    const hoja = (name: string, headers: string[], rows: unknown[][]) => {
      const ws = wb.addWorksheet(name);
      ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
      rows.forEach((row) => ws.addRow(row));
      estilo(ws);
      return ws;
    };
    const fecha = (iso: unknown) =>
      iso ? new Date(iso as string).toLocaleString('es-CO', { timeZone: TZ }) : '—';

    // Resumen
    const k = dash.resumen.kpis;
    const gc = dash.resumen.gestionCorreos;
    hoja(
      'Resumen',
      ['Métrica', 'Valor'],
      [
        ['Generado', fecha(dash.generadoEn)],
        ['Proyecto', dash.filtros.proyecto],
        ['Desde', dash.filtros.desde ?? '—'],
        ['Hasta', dash.filtros.hasta ?? '—'],
        ['Sesiones atendidas', k.sesiones.total],
        ['Cerrados', k.sesiones.cerrados],
        ['% cierre', `${k.sesiones.pctCierre}%`],
        ['Atención IA', k.sesiones.ia],
        ['Atención humana', k.sesiones.humano],
        ['Tiempo promedio (min)', k.sesiones.avgMinutes],
        ['Calificaciones', k.ratings.total],
        ['★ Promedio', k.ratings.promedio ?? '—'],
        ['Tickets', k.tickets.total],
        ['Correos', k.correos.total],
        ['Reuniones', k.reuniones.total],
        ['Correos gestión - resueltos', gc?.resueltos ?? 0],
        ['Correos gestión - pendientes', gc?.pendientes ?? 0],
        ['Correos gestión - total', gc?.total ?? 0],
      ],
    );

    // Gestión de correos (donut del dashboard): categoría + carpeta top
    hoja(
      'Gestión correos',
      ['Categoría', 'Correos', 'Carpeta con más correos'],
      (gc?.porCategoria ?? []).map((c: any) => [c.clave, c.count, c.carpeta ?? '—']),
    );

    // Asesores
    hoja(
      'Asesores',
      ['Asesor', 'Atendidas', 'Cerradas', 'Activas', 'Prom. min', '★ Promedio', 'Tickets'],
      dash.asesoria.tabla.map((a: any) => [
        a.nombre, a.atendidas, a.cerrados, a.activos,
        a.avgMinutes ?? '—', a.avgEstrellas ?? '—', a.tickets,
      ]),
    );

    // Colegios
    hoja(
      'Colegios',
      ['Colegio', 'Proyecto', 'Sesiones', 'Cerradas', 'Activas', 'IA', 'Humano', '★ Promedio', 'Tickets'],
      dash.colegios.tabla.map((c: any) => [
        c.colegio, c.proyecto, c.sesiones, c.cerradas, c.activas,
        c.ia, c.humano, c.avgEstrellas ?? '—', c.tickets ?? c.ratings ?? 0,
      ]),
    );

    // Atención: cruce asesor × colegio (la pestaña Atención del dashboard)
    const filasAtencion: any[] = dash.atencion?.tabla ?? [];
    hoja(
      'Atención',
      ['Asesor', 'Colegio', 'Proyecto', 'Atendidas', '★ Promedio'],
      filasAtencion.map((x) => [
        x.asesor, x.colegio, x.proyecto, x.atendidas,
        x.avgEstrellas ?? '—',
      ]),
    );

    // Tickets y correos (pestaña Tickets/Correos): nivel 1 por asesor y el
    // detalle de los dos lados, con la categoría de Gestión de cada uno.
    const tc = dash.ticketsCorreos;
    hoja(
      'Tickets-Correos',
      ['Asesor', 'Tickets', 'Abiertos', 'Resueltos', 'Correos'],
      (tc?.asesores ?? []).map((a: any) => [
        a.asesor, a.tickets, a.ticketsAbiertos, a.ticketsResueltos, a.correos,
      ]),
    );

    hoja(
      'Tickets',
      ['Fecha', 'Colegio', 'Categoría', 'Gestión', 'Prioridad', 'Estado', 'Resolución (min)'],
      (tc?.tickets ?? []).map((t: any) => [
        fecha(t.fecha), t.colegio ?? '—', t.categoria, t.gestion,
        t.prioridad, t.estado, t.resolucionMin ?? '—',
      ]),
    );

    hoja(
      'Correos',
      ['Fecha', 'Asunto', 'Carpeta', 'Gestión'],
      (tc?.correos ?? []).map((c: any) => [
        fecha(c.fecha), c.asunto, c.carpeta, c.gestion,
      ]),
    );

    // Reuniones
    // El Excel lleva la lista COMPLETA del rango, no la página que esté viendo
    // el admin en pantalla: `dash.reuniones.tabla` solo tiene 15 filas.
    const rangoExport = this.rango(filtros);
    const reuniones = await this.reunionesDelRango(filtros, rangoExport);
    hoja(
      'Reuniones',
      ['Reunión', 'Fecha', 'Tipo', 'Proyecto', 'Organizador', 'Duración (min)', 'Origen'],
      reuniones.map((e) => {
        const fila = this.aFilaTabla(e);
        return [
          fila.subject,
          fecha(fila.startDateTime),
          fila.categoria,
          fila.proyecto,
          fila.organizador,
          fila.duracion,
          fila.origen,
        ];
      }),
    );

    // Solicitudes
    hoja(
      'Solicitudes',
      ['Tipo', 'Cantidad', '%', 'Variación vs. periodo anterior (%)'],
      dash.solicitudes.distribucion.map((s: any) => [
        s.clave, s.count, `${s.pct}%`, s.variacion ?? '—',
      ]),
    );

    // Conexiones por agente
    const pctDisp = (c: any) => {
      const total =
        c.disponibleMin +
        c.ocupadoMin +
        c.reunionMin +
        c.almuerzoMin +
        c.inactivoMin;
      const base = total - c.almuerzoMin;
      if (!base) return '—';
      return `${Math.round((c.disponibleMin / base) * 100)}%`;
    };
    hoja(
      'Conexiones',
      [
        'Asesor',
        '% Disponibilidad',
        'Conectado (min)',
        'Disponible (min)',
        'Ocupado (min)',
        'Reuniones (min)',
        'Almuerzo (min)',
        'Inactivo (min)',
        'Primera conexión',
        'Última conexión',
        'Desconexiones',
      ],
      dash.conexiones.tabla.map((c: any) => [
        c.nombre,
        pctDisp(c),
        c.disponibleMin +
          c.ocupadoMin +
          c.reunionMin +
          c.almuerzoMin +
          c.inactivoMin -
          c.inactivoMin,
        c.disponibleMin,
        c.ocupadoMin,
        c.reunionMin,
        c.almuerzoMin,
        c.inactivoMin,
        fecha(c.primeraConexion),
        fecha(c.ultimaConexion),
        c.desconexiones,
      ]),
    );

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
