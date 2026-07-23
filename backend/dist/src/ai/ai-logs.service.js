"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AiLogsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiLogsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ai_log_entity_1 = require("./entities/ai-log.entity");
let AiLogsService = AiLogsService_1 = class AiLogsService {
    repo;
    logger = new common_1.Logger(AiLogsService_1.name);
    constructor(repo) {
        this.repo = repo;
    }
    async guardar(data) {
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
        }
        catch (e) {
            this.logger.error('[AiLogs] Error:', e);
        }
    }
    async actualizarFeedback(sessionId, pregunta, util) {
        try {
            await this.repo.update({ sessionId, pregunta }, { feedback: util });
        }
        catch (e) {
            this.logger.error('[AiLogs] Error al actualizar feedback:', e);
        }
    }
    async getStats(colegio) {
        const qb = this.repo.createQueryBuilder('l');
        if (colegio)
            qb.where('l.colegio = :colegio', { colegio });
        const [total, conContexto, transfers, errores, feedbackUtil] = await Promise.all([
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
};
exports.AiLogsService = AiLogsService;
exports.AiLogsService = AiLogsService = AiLogsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(ai_log_entity_1.AiLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AiLogsService);
//# sourceMappingURL=ai-logs.service.js.map