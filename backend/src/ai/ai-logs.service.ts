import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiLog } from './entitites/ai-log.entity';

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
  huboError?: boolean;
  errorMsg?: string;
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

      // Descomentar cuando crees la tabla en PostgreSQL
      // const log = this.repo.create({
      //   ...data,
      //   chunksUsados: data.chunksUsados ?? [],
      // });
      // await this.repo.save(log);
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

  async getStats(colegio?: string) {
    const qb = this.repo.createQueryBuilder('l');
    if (colegio) qb.where('l.colegio = :colegio', { colegio });

    const [total, conContexto, transfers, errores, feedbackUtil] =
      await Promise.all([
        qb.getCount(),
        qb.clone().andWhere('l.tuvoContexto = true').getCount(),
        qb.clone().andWhere('l.transfer = true').getCount(),
        qb.clone().andWhere('l.huboError = true').getCount(),
        qb.clone().andWhere('l.feedback = true').getCount(),
      ]);

    const tiempoAvg = await qb
      .clone()
      .select('AVG(l.tiempoRespuestaMs)', 'avg')
      .getRawOne();

    return {
      total,
      conContexto,
      transfers,
      errores,
      feedbackUtil,
      tiempoPromedioMs: Math.round(tiempoAvg?.avg ?? 0),
      tasaContexto: total ? Math.round((conContexto / total) * 100) : 0,
      tasaTransfer: total ? Math.round((transfers / total) * 100) : 0,
      tasaFeedbackUtil: total ? Math.round((feedbackUtil / total) * 100) : 0,
    };
  }
}
