import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { MetricsDashboardQueryDto } from './dto/metrics-dashboard-query.dto';

// Zona horaria del sistema (coincide con el resto de métricas).
const TZ = 'America/Bogota';
const TZ_OFFSET_MS = 5 * 3_600_000; // Bogotá = UTC-5
const DIA_MS = 86_400_000;

/**
 * Expresión de marca (proyecto) resuelta desde `colegios.tipo_colegio`
 * relacionando por nombre (sessions.colegio es string, sin FK).
 * Mismo criterio que `SessionsService.getDashboard`.
 */
const MARCA_SESIONES = `CASE
  WHEN lower(coalesce(c.tipo_colegio, '')) ~ 'control|academic' THEN 'ControlAcademic'
  WHEN lower(coalesce(c.tipo_colegio, '')) ~ 'sian|365' THEN 'Sian365'
  ELSE 'Sin clasificar' END`;

/** Variante para equipos/teams_meetings (columna tipo_colegio propia). */
const MARCA_REUNIONES = `CASE
  WHEN lower(coalesce(m.tipo_colegio, '')) ~ 'control|academic' THEN 'ControlAcademic'
  WHEN lower(coalesce(m.tipo_colegio, '')) ~ 'sian|365' THEN 'Sian365'
  ELSE 'Sin clasificar' END`;

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
    if (f.marca && f.marca !== 'all') {
      w.push(`${MARCA_SESIONES} = ${p.ph(f.marca)}`);
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

  // ── Dashboard completo ────────────────────────────────────────────────────
  async getDashboard(filtros: Filtros) {
    const rango = this.rango(filtros);
    const marca = filtros.marca ?? 'all';
    const cacheKey = `${this.CACHE_PREFIX}dashboard:${marca}:${filtros.desde ?? ''}:${filtros.hasta ?? ''}:${filtros.asesorId ?? ''}`;
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch {}

    const [resumen, requerimientos, colegios, asesoria, capacitaciones, solicitudes, conexiones] =
      await Promise.all([
        this.seccionResumen(filtros, rango),
        this.seccionRequerimientos(filtros, rango),
        this.seccionColegios(filtros, rango),
        this.seccionAsesoria(filtros, rango),
        this.seccionCapacitaciones(filtros, rango),
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
      tickets: this.pct(requerimientos.kpis.tickets.total, prev.tickets),
      correos: this.pct(resumen.kpis.correos.total, prev.correos),
      capacitaciones: this.pct(
        capacitaciones.kpis.capacitaciones.total,
        prev.capacitaciones,
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
      filtros: { marca, desde: filtros.desde ?? null, hasta: filtros.hasta ?? null, asesorId: filtros.asesorId ?? null },
      resumen: {
        kpis: {
          sesiones: resumen.kpis.sesiones,
          ratings: resumen.kpis.ratings,
          correos: resumen.kpis.correos,
          tickets: requerimientos.kpis.tickets,
          capacitaciones: capacitaciones.kpis.capacitaciones,
          ticketsPorEstado: requerimientos.ticketsPorEstado,
        },
        variacion,
        serie: resumen.serie,
        proyectos: resumen.proyectos,
        comentarios: resumen.comentarios,
        gestionCorreos: resumen.gestionCorreos,
        colegios: colegios.tabla.slice(0, 12),
        asesores: asesoria.tabla,
        actividad: {
          capacitaciones: capacitaciones.kpis.capacitaciones.total,
          proximasReuniones: capacitaciones.proximas,
          solicitudes: solicitudes.kpis.total,
          desconexiones: conexiones.kpis.desconexiones,
        },
      },
      requerimientos,
      colegios: { ...colegios, kpis: kpisColegios },
      asesoria: { ...asesoria, kpis: kpisAsesoria },
      capacitaciones,
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
    const [sesiones, ratings, correos, serie, proyectos, comentarios, previa, gestionCorreos] =
      await Promise.all([
        this.querySesionesKpis(f, r),
        this.queryRatingsKpis(f, r),
        this.queryCorreosKpis(f, r),
        this.querySerie(f, r),
        this.queryProyectos(f, r),
        this.queryComentarios(f, r),
        this.queryVariacionPrevia(f, r),
        this.queryGestionCorreos(f, r),
      ]);
    return {
      kpis: { sesiones, ratings, correos },
      serie,
      proyectos,
      comentarios,
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
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_SESIONES} = ${p.ph(f.marca)}`);
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

  /** Correos no tiene colegio/marca: aplica solo fechas y asesor. */
  private async queryCorreosKpis(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`m.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`m.created_at < ${p.ph(r.end)}`);
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
   * - `porCategoria`: conteo por `categoria_gestion` (catálogo local; vacío =>
   *   "Sin clasificar") y, para cada una, la carpeta del asesor de la que más
   *   correos provienen (`folder_display_name`), como contexto para la leyenda.
   * - `resueltos` / `pendientes`: normaliza las etiquetas de Outlook de la
   *   columna `categorias` (jsonb) quitando los símbolos decorativos y
   *   comparando en mayúsculas, igual que `categoria-correo.util.ts` del
   *   frontend. "RESUELTO" cuenta como resuelto; el resto (incluido sin
   *   etiqueta) queda como pendiente.
   */
  private async queryGestionCorreos(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`m.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`m.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.asesor_id = ${p.ph(f.asesorId)}`);
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';

    // Expresión que replica la normalización del frontend: quita los símbolos
    // iniciales con los que Outlook decora las categorías y deja el texto en
    // mayúsculas para comparar de forma estable.
    const normCat = `upper(regexp_replace(trim(x.cat), '^[\\s\\-=+*_•·✓✔☑✅❗!|#>»›.:;,]+', '', 'g'))`;

    const [porCategoria, estado] = await Promise.all([
      this.dataSource.query(
        `SELECT clave, cnt AS count, folder_display_name AS carpeta
         FROM (
           SELECT DISTINCT ON (clave) clave, cnt, folder_display_name
           FROM (
             SELECT coalesce(nullif(trim(m.categoria_gestion), ''), 'Sin clasificar') AS clave,
                    coalesce(m.folder_display_name, '(sin carpeta)') AS folder_display_name,
                    COUNT(*)::int AS cnt
             FROM correo_mensajes m
             ${where}
             GROUP BY 1, 2
           ) t
           ORDER BY clave, cnt DESC
         ) x
         ORDER BY cnt DESC`,
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

  private async querySerie(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT to_char(s.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS fecha,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE s.advisor_id IS NOT NULL)::int AS "conAsesor",
              COUNT(*) FILTER (WHERE s.advisor_id IS NULL)::int AS ia
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY 1 ORDER BY 1`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      total: this.n(row.total),
      conAsesor: this.n(row.conAsesor),
      ia: this.n(row.ia),
    }));
  }

  private async queryProyectos(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    const rows = await this.dataSource.query(
      `SELECT ${MARCA_SESIONES} AS proyecto, COUNT(*)::int AS total
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

  private async queryComentarios(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`r.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`r.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_SESIONES} = ${p.ph(f.marca)}`);
    const rows = await this.dataSource.query(
      `SELECT r.comentario, r.estrellas, r.created_at AS fecha, s.colegio,
              u.name AS asesor
       FROM ratings r
       JOIN sessions s ON s.id = r.session_id
       LEFT JOIN users u ON u.id = s.advisor_id
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       ORDER BY r.estrellas DESC, r.created_at DESC
       LIMIT 8`,
      p.args,
    );
    return rows.map((row: any) => ({
      comentario: row.comentario ?? '',
      estrellas: this.n(row.estrellas),
      fecha: row.fecha,
      colegio: row.colegio ?? null,
      asesor: row.asesor ?? null,
    }));
  }

  /** Contadores del periodo anterior (misma longitud) para las variaciones. */
  private async queryVariacionPrevia(f: Filtros, r: Rango) {
    const vacio = {
      sesiones: { total: 0, cerrados: 0, ia: 0 },
      ratings: 0,
      tickets: 0,
      correos: 0,
      capacitaciones: 0,
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
    if (f.marca && f.marca !== 'all') wR.push(`${MARCA_SESIONES} = ${pR.ph(f.marca)}`);

    const pT = new Params();
    const wT: string[] = [];
    if (prev.start) wT.push(`t.created_at >= ${pT.ph(prev.start)}`);
    if (prev.end) wT.push(`t.created_at < ${pT.ph(prev.end)}`);
    if (f.asesorId) wT.push(`t.assigned_to_id = ${pT.ph(f.asesorId)}`);

    const pC = new Params();
    const wC: string[] = [];
    if (prev.start) wC.push(`m.created_at >= ${pC.ph(prev.start)}`);
    if (prev.end) wC.push(`m.created_at < ${pC.ph(prev.end)}`);
    if (f.asesorId) wC.push(`m.asesor_id = ${pC.ph(f.asesorId)}`);

    const pM = new Params();
    const wM: string[] = [];
    if (prev.start) wM.push(`m.start_date_time >= ${pM.ph(prev.start)}`);
    if (prev.end) wM.push(`m.start_date_time < ${pM.ph(prev.end)}`);
    if (f.asesorId) wM.push(`m.created_by = ${pM.ph(f.asesorId)}`);

    const [ses, rat, tic, cor, cap] = await Promise.all([
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
         ${wT.length ? `WHERE ${wT.join(' AND ')}` : ''}`,
        pT.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM correo_mensajes m
         ${wC.length ? `WHERE ${wC.join(' AND ')}` : ''}`,
        pC.args,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM teams_meetings m
         ${wM.length ? `WHERE ${wM.join(' AND ')}` : ''}`,
        pM.args,
      ),
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
      capacitaciones: this.n(cap[0]?.total),
    };
  }

  // ── Sección: requerimientos ───────────────────────────────────────────────
  private async seccionRequerimientos(f: Filtros, r: Rango) {
    const [kpisSesiones, cierresPorTipo, ticketsPorEstado, ticketsPorPrioridad, ticketsPorCategoria, sla, detalleTickets, detalleRequerimientos] =
      await Promise.all([
        this.querySesionesKpis(f, r),
        this.queryCierresPorTipo(f, r),
        this.queryTicketsGroup(f, r, 'status'),
        this.queryTicketsGroup(f, r, 'priority'),
        this.queryTicketsGroup(f, r, 'category'),
        this.querySlaTickets(f, r),
        this.queryDetalleTickets(f, r),
        this.queryDetalleRequerimientos(f, r),
      ]);

    const ticketsTotal = ticketsPorEstado.reduce(
      (sum: number, t: any) => sum + t.count,
      0,
    );
    const ticketsAbiertos = ticketsPorEstado
      .filter((t: any) => ['open', 'in_progress', 'on_hold'].includes(t.clave))
      .reduce((sum: number, t: any) => sum + t.count, 0);
    const ticketsResueltos = ticketsPorEstado
      .filter((t: any) => ['resolved', 'closed'].includes(t.clave))
      .reduce((sum: number, t: any) => sum + t.count, 0);

    const cierresRequerimiento =
      cierresPorTipo.find((c: any) => c.tipo === 'requerimiento')?.count ?? 0;

    return {
      kpis: {
        cierresRequerimiento,
        tickets: {
          total: ticketsTotal,
          abiertos: ticketsAbiertos,
          resueltos: ticketsResueltos,
        },
        clasificadasSesion: kpisSesiones.clasificadas,
      },
      cierresPorTipo,
      ticketsPorEstado,
      ticketsPorPrioridad,
      ticketsPorCategoria,
      sla,
      detalleTickets,
      detalleRequerimientos,
    };
  }

  /** Filtros de marca/asesor + fecha de clasificación (sin rango de creación). */
  private whereClasificacion(p: Params, f: Filtros, r: Rango): string[] {
    const w: string[] = [];
    if (f.asesorId) w.push(`s.advisor_id = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') {
      w.push(`${MARCA_SESIONES} = ${p.ph(f.marca)}`);
    }
    w.push(
      `coalesce(s.cierre_at, s.closed_at, s.created_at) >= ${p.ph(r.start ?? new Date(0))}`,
    );
    w.push(
      `coalesce(s.cierre_at, s.closed_at, s.created_at) < ${p.ph(r.end ?? new Date('2999-12-31'))}`,
    );
    return w;
  }

  private async queryCierresPorTipo(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereClasificacion(p, f, r);
    w.push('s.cierre_tipo IS NOT NULL');
    const rows = await this.dataSource.query(
      `SELECT s.cierre_tipo AS tipo, COUNT(*)::int AS count
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY 1 ORDER BY 2 DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      tipo: row.tipo,
      count: this.n(row.count),
    }));
  }

  private async queryTicketsGroup(f: Filtros, r: Rango, campo: 'status' | 'priority' | 'category') {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`t.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`t.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`t.assigned_to_id = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') {
      w.push(`${MARCA_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.marca)}`);
    }
    const expr =
      campo === 'category'
        ? `coalesce(t.category, 'Sin categoría')`
        : `t.${campo}`;
    const rows = await this.dataSource.query(
      `SELECT ${expr} AS clave, COUNT(*)::int AS count
       FROM tickets t
       LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1 ORDER BY 2 DESC
       LIMIT 12`,
      p.args,
    );
    return rows.map((row: any) => ({
      clave: row.clave ?? 'Sin clasificar',
      count: this.n(row.count),
    }));
  }

  private async querySlaTickets(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`t.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`t.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`t.assigned_to_id = ${p.ph(f.asesorId)}`);
    const rows = await this.dataSource.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 60)
                FILTER (WHERE t.closed_at IS NOT NULL))::int AS "promResolucionMin",
              COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL
                AND t.sla_deadline < now()
                AND t.status NOT IN ('closed', 'resolved'))::int AS vencidos
       FROM tickets t
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`,
      p.args,
    );
    const row = rows[0] ?? {};
    return {
      promResolucionMin: row.promResolucionMin == null ? null : this.n(row.promResolucionMin),
      vencidos: this.n(row.vencidos),
    };
  }

  private async queryDetalleTickets(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`t.created_at >= ${p.ph(r.start)}`);
    if (r.end) w.push(`t.created_at < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`t.assigned_to_id = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') {
      w.push(`${MARCA_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.marca)}`);
    }
    const rows = await this.dataSource.query(
      `SELECT t.created_at AS fecha, t.institucion AS colegio,
              coalesce(t.assigned_to_name, '—') AS asesor,
              coalesce(t.category, 'Sin categoría') AS categoria,
              t.priority AS prioridad, t.status AS estado,
              ROUND(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 60)::int AS "resolucionMin"
       FROM tickets t
       LEFT JOIN colegios tc ON lower(tc.nombre) = lower(t.institucion)
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       ORDER BY t.created_at DESC
       LIMIT 50`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      colegio: row.colegio ?? null,
      asesor: row.asesor,
      categoria: row.categoria,
      prioridad: row.prioridad,
      estado: row.estado,
      resolucionMin: row.resolucionMin == null ? null : this.n(row.resolucionMin),
    }));
  }

  private async queryDetalleRequerimientos(f: Filtros, r: Rango) {
    const p = new Params();
    const w = this.whereClasificacion(p, f, r);
    w.push(`s.cierre_tipo = ${p.ph('requerimiento')}`);
    const rows = await this.dataSource.query(
      `SELECT coalesce(s.cierre_at, s.closed_at, s.created_at) AS fecha,
              s.colegio, u.name AS asesor, s.cierre_notas AS notas,
              s.cierre_seguimiento AS seguimiento
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       LEFT JOIN users u ON u.id = s.advisor_id
       WHERE ${w.join(' AND ')}
       ORDER BY 1 DESC
       LIMIT 30`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      colegio: row.colegio ?? null,
      asesor: row.asesor ?? '—',
      notas: row.notas ?? '',
      seguimiento: !!row.seguimiento,
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
    return { kpis, tabla: tablaConDatos, estrellas, ticketsPorColegio };
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
    if (f.marca && f.marca !== 'all') {
      wT.push(`${MARCA_SESIONES.replace(/\bc\./g, 'tc.')} = ${pT.ph(f.marca)}`);
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
      `SELECT s.colegio AS colegio, ${MARCA_SESIONES} AS marca,
              COUNT(*)::int AS sesiones,
              COUNT(*) FILTER (WHERE s.status = 'closed')::int AS cerradas,
              COUNT(*) FILTER (WHERE s.status = 'active')::int AS activas,
              COUNT(*) FILTER (WHERE s.advisor_id IS NULL)::int AS ia,
              COUNT(*) FILTER (WHERE s.advisor_id IS NOT NULL)::int AS humano
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${w.join(' AND ')}
       GROUP BY s.colegio, ${MARCA_SESIONES}
       ORDER BY 3 DESC
       LIMIT 100`,
      p.args,
    );
    return rows.map((row: any) => ({
      colegio: row.colegio,
      marca: row.marca,
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
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_SESIONES} = ${p.ph(f.marca)}`);
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
    if (f.marca && f.marca !== 'all') {
      w.push(`${MARCA_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.marca)}`);
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
      topCerrados: [...tablaEnriquecida]
        .sort((a: any, b: any) => b.cerrados - a.cerrados)
        .slice(0, 5)
        .map((x: any) => ({ nombre: x.nombre, cerrados: x.cerrados })),
    };
  }

  /**
   * Tabla de asesores para el dashboard y la pestaña Asesoría.
   *
   * Se parte de `users` (solo rol `advisor`, activos) con LEFT JOIN a las
   * sesiones del rango: así listan TODOS los asesores, incluso los que no
   * atendieron chats en el periodo (aparecen con 0 en todas las columnas).
   * Orden: primero quienes tienen más atención, y al final los sin actividad.
   */
  private async queryAsesoresTabla(f: Filtros, r: Rango) {
    const p = new Params();
    const sesiones = this.whereSesiones(p, f, r);
    // whereSesiones ya agregó los parámetros de marca/fechas/asesor a `p`.
    const rows = await this.dataSource.query(
      `SELECT u.id, u.name AS nombre,
              COUNT(s.id)::int AS atendidas,
              COUNT(s.id) FILTER (WHERE s.status = 'closed')::int AS cerrados,
              COUNT(s.id) FILTER (WHERE s.status = 'active')::int AS activos,
              ROUND(AVG(EXTRACT(EPOCH FROM (s.closed_at - s.created_at)) / 60)
                FILTER (WHERE s.status = 'closed' AND s.closed_at IS NOT NULL))::int AS "avgMinutes"
       FROM users u
       LEFT JOIN sessions s
         ON s.advisor_id = u.id
        ${sesiones.length ? `AND ${sesiones.join(' AND ')}` : ''}
       WHERE u.role = 'advisor' AND u.active = true
         ${f.asesorId ? `AND u.id = ${p.ph(f.asesorId)}` : ''}
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
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_SESIONES} = ${p.ph(f.marca)}`);
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
    if (f.marca && f.marca !== 'all') {
      w.push(`${MARCA_SESIONES.replace(/\bc\./g, 'tc.')} = ${p.ph(f.marca)}`);
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

  // ── Sección: capacitaciones ───────────────────────────────────────────────
  private async seccionCapacitaciones(f: Filtros, r: Rango) {
    const [kpis, porModalidad, porMarca, porDia, tabla, proximas] =
      await Promise.all([
        this.queryReunionesKpis(f, r),
        this.queryReunionesGroup(f, r, 'modalidad'),
        this.queryReunionesGroup(f, r, 'marca'),
        this.queryReunionesPorDia(f, r),
        this.queryReunionesTabla(f, r),
        this.queryProximasReuniones(f),
      ]);
    return { kpis, porModalidad, porMarca, porDia, tabla, proximas };
  }

  private async queryReunionesKpis(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`m.start_date_time >= ${p.ph(r.start)}`);
    if (r.end) w.push(`m.start_date_time < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.created_by = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_REUNIONES} = ${p.ph(f.marca)}`);
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE m.modalidad = 'virtual')::int AS virtuales,
              COUNT(*) FILTER (WHERE m.modalidad = 'presencial')::int AS presenciales
       FROM teams_meetings m
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`,
      p.args,
    );
    const row = rows[0] ?? {};
    return {
      capacitaciones: {
        total: this.n(row.total),
        virtuales: this.n(row.virtuales),
        presenciales: this.n(row.presenciales),
      },
    };
  }

  private async queryReunionesGroup(
    f: Filtros,
    r: Rango,
    campo: 'modalidad' | 'marca',
  ) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`m.start_date_time >= ${p.ph(r.start)}`);
    if (r.end) w.push(`m.start_date_time < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.created_by = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_REUNIONES} = ${p.ph(f.marca)}`);
    const expr = campo === 'modalidad' ? `m.modalidad` : MARCA_REUNIONES;
    const rows = await this.dataSource.query(
      `SELECT ${expr} AS clave, COUNT(*)::int AS count
       FROM teams_meetings m
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1 ORDER BY 2 DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      clave: row.clave ?? 'Sin clasificar',
      count: this.n(row.count),
    }));
  }

  private async queryReunionesPorDia(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`m.start_date_time >= ${p.ph(r.start)}`);
    if (r.end) w.push(`m.start_date_time < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.created_by = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_REUNIONES} = ${p.ph(f.marca)}`);
    const rows = await this.dataSource.query(
      `SELECT to_char(m.start_date_time AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS fecha,
              COUNT(*)::int AS count
       FROM teams_meetings m
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       GROUP BY 1 ORDER BY 1`,
      p.args,
    );
    return rows.map((row: any) => ({
      fecha: row.fecha,
      count: this.n(row.count),
    }));
  }

  private async queryReunionesTabla(f: Filtros, r: Rango) {
    const p = new Params();
    const w: string[] = [];
    if (r.start) w.push(`m.start_date_time >= ${p.ph(r.start)}`);
    if (r.end) w.push(`m.start_date_time < ${p.ph(r.end)}`);
    if (f.asesorId) w.push(`m.created_by = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_REUNIONES} = ${p.ph(f.marca)}`);
    const rows = await this.dataSource.query(
      `SELECT m.id, m.subject, m.start_date_time AS "startDateTime",
              m.modalidad, ${MARCA_REUNIONES} AS marca,
              m.created_by_name AS organizador, m.duration_minutes AS duracion,
              m.join_url AS "joinUrl"
       FROM teams_meetings m
       ${w.length ? `WHERE ${w.join(' AND ')}` : ''}
       ORDER BY m.start_date_time ASC
       LIMIT 50`,
      p.args,
    );
    return rows.map((row: any) => ({
      id: row.id,
      subject: row.subject,
      startDateTime: row.startDateTime,
      modalidad: row.modalidad === 'presencial' ? 'presencial' : 'virtual',
      marca: row.marca,
      organizador: row.organizador ?? '—',
      duracion: this.n(row.duracion),
      joinUrl: row.joinUrl ?? null,
    }));
  }

  private async queryProximasReuniones(f: Filtros) {
    const p = new Params();
    const w: string[] = [
      `m.start_date_time >= now()`,
      `m.start_date_time < now() + interval '30 days'`,
    ];
    if (f.asesorId) w.push(`m.created_by = ${p.ph(f.asesorId)}`);
    if (f.marca && f.marca !== 'all') w.push(`${MARCA_REUNIONES} = ${p.ph(f.marca)}`);
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM teams_meetings m WHERE ${w.join(' AND ')}`,
      p.args,
    );
    return this.n(rows[0]?.total);
  }

  // ── Sección: solicitudes ──────────────────────────────────────────────────
  private async seccionSolicitudes(f: Filtros, r: Rango) {
    const [distribucion, serie, porMarca, kpiBase, previa] = await Promise.all([
      this.querySolicitudesGroup(f, r),
      this.querySolicitudesSerie(f, r),
      this.querySolicitudesPorMarca(f, r),
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
    return {
      kpis: {
        total,
        topTipo: top,
        pctClasificadas: kpiBase.total
          ? Math.round((kpiBase.clasificadas / kpiBase.total) * 100)
          : 0,
        clasificadas: kpiBase.clasificadas,
      },
      distribucion: conVariacion,
      serie,
      porMarca,
    };
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
    if (!r.start || !r.end) return [];
    const len = r.end.getTime() - r.start.getTime();
    const prev: Rango = {
      start: new Date(r.start.getTime() - len),
      end: new Date(r.start.getTime()),
      desdeStr: '',
      hastaStr: '',
    };
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

  private async querySolicitudesPorMarca(f: Filtros, r: Rango) {
    const p = new Params();
    const where = this.whereSesiones(p, f, r);
    where.push(`s.tipo_solicitud IS NOT NULL AND s.tipo_solicitud <> ''`);
    const rows = await this.dataSource.query(
      `SELECT ${MARCA_SESIONES} AS clave, COUNT(*)::int AS count
       FROM sessions s
       LEFT JOIN colegios c ON lower(c.nombre) = lower(s.colegio)
       WHERE ${where.join(' AND ')}
       GROUP BY 1 ORDER BY 2 DESC`,
      p.args,
    );
    return rows.map((row: any) => ({
      clave: row.clave,
      count: this.n(row.count),
    }));
  }

  // ── Sección: conexiones por agente ────────────────────────────────────────
  private async seccionConexiones(f: Filtros, r: Rango) {
    const esUnDia = r.desdeStr === r.hastaStr;
    const [tabla, porDia, barras] = await Promise.all([
      this.queryConexionesTabla(f, r),
      this.queryDesconexionesPorDia(f, r),
      esUnDia ? this.queryConexionesBarras(f, r) : Promise.resolve(null),
    ]);
    const sum = (campo: string) =>
      tabla.reduce((s: number, x: any) => s + this.n(x[campo]), 0);
    const kpis = {
      disponibleMin: sum('disponibleMin'),
      ocupadoMin: sum('ocupadoMin'),
      reunionMin: sum('reunionMin'),
      almuerzoMin: sum('almuerzoMin'),
      inactivoMin: sum('inactivoMin'),
      desconexiones: sum('desconexiones'),
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
      asesores: [...porId.values()].filter((a) => a.periodos.length > 0 || !f.asesorId),
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
        ['Marca', dash.filtros.marca],
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
        ['Capacitaciones', k.capacitaciones.total],
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
      ['Colegio', 'Marca', 'Sesiones', 'Cerradas', 'Activas', 'IA', 'Humano', '★ Promedio', 'Tickets'],
      dash.colegios.tabla.map((c: any) => [
        c.colegio, c.marca, c.sesiones, c.cerradas, c.activas,
        c.ia, c.humano, c.avgEstrellas ?? '—', c.tickets ?? c.ratings ?? 0,
      ]),
    );

    // Requerimientos
    const rq = dash.requerimientos;
    hoja(
      'Requerimientos',
      ['Indicador', 'Valor'],
      [
        ['Cierres clasificados como requerimiento', rq.kpis.cierresRequerimiento],
        ['Tickets totales', rq.kpis.tickets.total],
        ['Tickets abiertos', rq.kpis.tickets.abiertos],
        ['Tickets resueltos', rq.kpis.tickets.resueltos],
        ['Promedio de resolución (min)', rq.sla.promResolucionMin ?? '—'],
        ['SLA vencidos sin resolver', rq.sla.vencidos],
        ...rq.cierresPorTipo.map((c: any) => [`Cierres: ${c.tipo}`, c.count]),
      ],
    );

    // Tickets
    hoja(
      'Tickets',
      ['Fecha', 'Colegio', 'Asesor', 'Categoría', 'Prioridad', 'Estado', 'Resolución (min)'],
      rq.detalleTickets.map((t: any) => [
        fecha(t.fecha), t.colegio ?? '—', t.asesor, t.categoria,
        t.prioridad, t.estado, t.resolucionMin ?? '—',
      ]),
    );

    // Capacitaciones
    hoja(
      'Capacitaciones',
      ['Reunión', 'Fecha', 'Modalidad', 'Marca', 'Organizador', 'Duración (min)'],
      dash.capacitaciones.tabla.map((m: any) => [
        m.subject, fecha(m.startDateTime), m.modalidad, m.marca, m.organizador, m.duracion,
      ]),
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
    hoja(
      'Conexiones',
      ['Asesor', 'Disponible (min)', 'Ocupado (min)', 'Reuniones (min)', 'Almuerzo (min)', 'Inactivo (min)', 'Primera conexión', 'Última conexión', 'Desconexiones'],
      dash.conexiones.tabla.map((c: any) => [
        c.nombre, c.disponibleMin, c.ocupadoMin, c.reunionMin,
        c.almuerzoMin, c.inactivoMin, fecha(c.primeraConexion), fecha(c.ultimaConexion),
        c.desconexiones,
      ]),
    );

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
