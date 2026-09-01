import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AiLog } from './entities/ai-log.entity';

export interface LogData {
  sessionId?: string;
  colegio?: string;
  rol?: string;
  tipoSolicitud?: string;
  clientName?: string;
  pregunta: string;
  respuesta?: string;
  chunksUsados?: {
    nombre: string;
    categoria: string | null;
    chunkIndex: number;
    distancia: number | null;
    fragmento: string;
  }[];
  tuvoContexto?: boolean;
  tiempoRespuestaMs?: number;
  tokensEstimados?: number;
  transfer?: boolean;
  feedback?: boolean;
  esRestringido?: boolean;
  esOfensivo?: boolean;
  redireccionInstitucional?: boolean;
  temaInstitucional?: string;
  huboError?: boolean;
  errorMsg?: string;
}

export interface AiStatsFiltros {
  colegio?: string;
  asesorId?: string;
  desde?: string;
  hasta?: string;
}

@Injectable()
export class AiLogsService {
  private readonly logger = new Logger(AiLogsService.name);

  constructor(
    @InjectRepository(AiLog)
    private readonly repo: Repository<AiLog>,
  ) {}

  async guardar(data: LogData): Promise<void> {
    try {
      this.logger.debug(`\n─────────────────────────────────────────
📋 AI LOG
─────────────────────────────────────────
👤 Cliente     : ${data.clientName ?? '-'}
🏫 Colegio     : ${data.colegio ?? '-'}
🎭 Rol         : ${data.rol ?? '-'}
📌 Solicitud   : ${data.tipoSolicitud ?? '-'}
❓ Pregunta    : ${data.pregunta}
💬 Respuesta   : ${data.respuesta ? data.respuesta.slice(0, 120) + (data.respuesta.length > 120 ? '...' : '') : '-'}
📄 Chunks RAG  : ${data.chunksUsados?.length ? data.chunksUsados.map((c) => `\\n   • ${c.nombre} [chunk ${c.chunkIndex}]${c.distancia != null ? ` (dist: ${c.distancia})` : ''}\\n     "${c.fragmento?.slice(0, 100)}..."`).join('') : ' ninguno'}
🔍 Contexto RAG: ${data.tuvoContexto ? 'SÍ' : 'NO'}
⏱️  Tiempo      : ${data.tiempoRespuestaMs ? `${data.tiempoRespuestaMs}ms` : '-'}
🔢 Tokens est. : ${data.tokensEstimados ?? '-'}
🔀 Transfer    : ${data.transfer ? 'SÍ' : 'NO'}
🚫 Restringido : ${data.esRestringido ? 'SÍ' : 'NO'}
❌ Error       : ${data.huboError ? `SÍ — ${data.errorMsg}` : 'NO'}
─────────────────────────────────────────`);

      const log = this.repo.create({
        sessionId: data.sessionId ?? undefined,
        colegio: data.colegio ?? undefined,
        rol: data.rol ?? undefined,
        tipoSolicitud: data.tipoSolicitud ?? undefined,
        clientName: data.clientName ?? undefined,
        pregunta: data.pregunta,
        respuesta: data.respuesta ?? undefined,
        chunksUsados: data.chunksUsados ?? [],
        tuvoContexto: data.tuvoContexto ?? false,
        tiempoRespuestaMs: data.tiempoRespuestaMs ?? undefined,
        tokensEstimados: data.tokensEstimados ?? undefined,
        transfer: data.transfer ?? false,
        feedback: data.feedback ?? undefined,
        esRestringido: data.esRestringido ?? false,
        esOfensivo: data.esOfensivo ?? false,
        redireccionInstitucional: data.redireccionInstitucional ?? false,
        temaInstitucional: data.temaInstitucional ?? undefined,
        huboError: data.huboError ?? false,
        errorMsg: data.errorMsg ?? undefined,
      });
      await this.repo.save(log);
    } catch (e) {
      this.logger.error('[AiLogs] Error:', e);
    }
  }

  async actualizarFeedback(
    sessionId: string,
    pregunta: string,
    util: boolean,
  ): Promise<void> {
    try {
      await this.repo.update({ sessionId, pregunta }, { feedback: util });
    } catch (e) {
      this.logger.error('[AiLogs] Error al actualizar feedback:', e);
    }
  }

  private aplicarFiltros(
    qb: SelectQueryBuilder<AiLog>,
    filtros: AiStatsFiltros,
  ) {
    if (filtros.colegio) {
      qb.andWhere('l.colegio = :colegio', { colegio: filtros.colegio });
    }
    if (filtros.asesorId) {
      // sessions.id es uuid y l.sessionId es varchar -> castear a text para comparar
      qb.andWhere(
        '(l.sessionId IN (SELECT s.id::text FROM sessions s WHERE s.advisor_id = :asesorId))',
        { asesorId: filtros.asesorId },
      );
    }
    if (filtros.desde) {
      qb.andWhere('l.creadoEn >= :desde', { desde: new Date(filtros.desde) });
    }
    if (filtros.hasta) {
      const hasta = new Date(filtros.hasta);
      hasta.setDate(hasta.getDate() + 1);
      qb.andWhere('l.creadoEn < :hasta', { hasta });
    }
    return qb;
  }

  async getStats(colegio?: string) {
    const filtros: AiStatsFiltros = colegio ? { colegio } : {};

    const contar = (pred: string) => {
      const qb = this.aplicarFiltros(
        this.repo.createQueryBuilder('l'),
        filtros,
      );
      if (pred) qb.andWhere(pred);
      return qb.getCount();
    };

    const [total, conContexto, transfers, errores, feedbackUtil, esOfensivo] =
      await Promise.all([
        contar(''),
        contar('l.tuvoContexto = true'),
        contar('l.transfer = true'),
        contar('l.huboError = true'),
        contar('l.feedback = true'),
        contar('l.esOfensivo = true'),
      ]);

    const tiempoAvg = await this.aplicarFiltros(
      this.repo.createQueryBuilder('l'),
      filtros,
    )
      .select('AVG(l.tiempoRespuestaMs)', 'avg')
      .getRawOne();

    return {
      total,
      conContexto,
      transfers,
      errores,
      feedbackUtil,
      esOfensivo,
      tiempoPromedioMs: Math.round(tiempoAvg?.avg ?? 0),
      tasaContexto: total ? Math.round((conContexto / total) * 100) : 0,
      tasaTransfer: total ? Math.round((transfers / total) * 100) : 0,
      tasaFeedbackUtil: total ? Math.round((feedbackUtil / total) * 100) : 0,
      tasaOfensas: total ? Math.round((esOfensivo / total) * 100) : 0,
    };
  }

  async getStatsDetallado(filtros: AiStatsFiltros = {}) {
    const contar = async (pred: string, params: Record<string, unknown> = {}) => {
      const qb = this.aplicarFiltros(
        this.repo.createQueryBuilder('l'),
        filtros,
      );
      if (pred) qb.andWhere(pred, params);
      return qb.getCount();
    };

    const [
      total,
      conContexto,
      transfers,
      errores,
      esRestringido,
      esOfensivo,
      redireccion,
      feedbackPositivo,
      feedbackNegativo,
    ] = await Promise.all([
      contar(''),
      contar('l.tuvoContexto = true'),
      contar('l.transfer = true'),
      contar('l.huboError = true'),
      contar('l.esRestringido = true'),
      contar('l.esOfensivo = true'),
      contar('l.redireccionInstitucional = true'),
      contar('l.feedback = true'),
      contar('l.feedback = false'),
    ]);

    const tiempos = await this.aplicarFiltros(
      this.repo.createQueryBuilder('l'),
      filtros,
    )
      .select('AVG(l.tiempoRespuestaMs)', 'avg')
      .addSelect(
        'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.tiempoRespuestaMs)',
        'mediana',
      )
      .addSelect(
        'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY l.tiempoRespuestaMs)',
        'p95',
      )
      .addSelect('AVG(l.tokensEstimados)', 'tokensAvg')
      .addSelect('SUM(l.tokensEstimados)', 'tokensTotal')
      .andWhere('l.tiempoRespuestaMs IS NOT NULL')
      .getRawOne<{
        avg: string | null;
        mediana: string | null;
        p95: string | null;
        tokensAvg: string | null;
        tokensTotal: string | null;
      }>();

    const agrupar = async (columna: string) => {
      const qb = this.aplicarFiltros(
        this.repo.createQueryBuilder('l'),
        filtros,
      );
      return qb
        .select(`l.${columna}`, 'valor')
        .addSelect('COUNT(*)', 'count')
        .where(`l.${columna} IS NOT NULL`)
        .andWhere(`l.${columna} != ''`)
        .groupBy(`l.${columna}`)
        .orderBy('COUNT(*)', 'DESC')
        .limit(10)
        .getRawMany<{ valor: string; count: string }>();
    };

    const [porRol, porSolicitud, porColegio, porTema] = await Promise.all([
      agrupar('rol'),
      agrupar('tipoSolicitud'),
      agrupar('colegio'),
      agrupar('temaInstitucional'),
    ]);

    const tendencia = await this.aplicarFiltros(
      this.repo.createQueryBuilder('l'),
      filtros,
    )
      .select("to_char(l.creadoEn, 'YYYY-MM-DD')", 'fecha')
      .addSelect('COUNT(*)', 'count')
      .groupBy('fecha')
      .orderBy('fecha', 'DESC')
      .limit(30)
      .getRawMany<{ fecha: string; count: string }>();

    const sinRegistrarFeedback = total - feedbackPositivo - feedbackNegativo;

    return {
      total,
      conContexto,
      transfers,
      errores,
      esRestringido,
      esOfensivo,
      redireccion,
      feedbackPositivo,
      feedbackNegativo,
      feedbackSinResponder: Math.max(sinRegistrarFeedback, 0),
      tiempoPromedioMs: Math.round(Number(tiempos?.avg) || 0),
      medianaMs: Math.round(Number(tiempos?.mediana) || 0),
      p95Ms: Math.round(Number(tiempos?.p95) || 0),
      tokensPromedio: Math.round(Number(tiempos?.tokensAvg) || 0),
      tokensTotales: Math.round(Number(tiempos?.tokensTotal) || 0),
      tasas: {
        contexto: total ? Math.round((conContexto / total) * 100) : 0,
        transfer: total ? Math.round((transfers / total) * 100) : 0,
        error: total ? Math.round((errores / total) * 100) : 0,
        restringido: total ? Math.round((esRestringido / total) * 100) : 0,
        ofensas: total ? Math.round((esOfensivo / total) * 100) : 0,
        redireccion: total ? Math.round((redireccion / total) * 100) : 0,
        feedbackUtil: total
          ? Math.round((feedbackPositivo / total) * 100)
          : 0,
      },
      porRol,
      porSolicitud,
      porColegio,
      porTema,
      tendencia,
    };
  }

  async getStatsPorAsesor(filtros: { desde?: string; hasta?: string } = {}) {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (filtros.desde) {
      condiciones.push('l."creadoEn" >= $1');
      params.push(new Date(filtros.desde));
    }
    if (filtros.hasta) {
      const hasta = new Date(filtros.hasta);
      hasta.setDate(hasta.getDate() + 1);
      condiciones.push(`l."creadoEn" < $${params.length + 1}`);
      params.push(hasta);
    }
    const where = condiciones.length
      ? ` AND ${condiciones.join(' AND ')}`
      : '';

    const rows = await this.repo.manager.query(
      `SELECT
        s."advisor_id" AS "asesorId",
        u.name AS "nombre",
        COUNT(l.id)::int AS "total",
        COUNT(*) FILTER (WHERE l."tuvoContexto" = true)::int AS "conContexto",
        COUNT(*) FILTER (WHERE l."transfer" = true)::int AS "transfers",
        COUNT(*) FILTER (WHERE l."huboError" = true)::int AS "errores",
        COUNT(*) FILTER (WHERE l."esOfensivo" = true)::int AS "ofensas",
        COUNT(*) FILTER (WHERE l."feedback" = true)::int AS "feedbackUtil",
        ROUND(AVG(l."tiempoRespuestaMs")) AS "tiempoPromedio"
       FROM ai_logs l
       INNER JOIN sessions s ON s.id::text = l."sessionId" AND s."advisor_id" IS NOT NULL
       INNER JOIN users u ON u.id = s."advisor_id" AND u.role = 'advisor'
       WHERE 1=1${where}
       GROUP BY s."advisor_id", u.name
       ORDER BY COUNT(l.id) DESC`,
      params,
    ) as Array<{
      asesorId: string;
      nombre: string;
      total: number;
      conContexto: number;
      transfers: number;
      errores: number;
      ofensas: number;
      feedbackUtil: number;
      tiempoPromedio: string | null;
    }>;

    return rows.map((r) => ({
      asesorId: r.asesorId,
      nombre: r.nombre ?? 'Sin nombre',
      total: Number(r.total),
      conContexto: Number(r.conContexto),
      transfers: Number(r.transfers),
      errores: Number(r.errores),
      ofensas: Number(r.ofensas),
      feedbackUtil: Number(r.feedbackUtil),
      tiempoPromedioMs: Math.round(Number(r.tiempoPromedio) || 0),
      tasaTransfer: Number(r.total)
        ? Math.round((Number(r.transfers) / Number(r.total)) * 100)
        : 0,
      tasaError: Number(r.total)
        ? Math.round((Number(r.errores) / Number(r.total)) * 100)
        : 0,
    }));
  }
}
