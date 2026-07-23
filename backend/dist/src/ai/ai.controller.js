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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const ai_service_1 = require("./ai.service");
const ai_logs_service_1 = require("./ai-logs.service");
const ai_chat_dto_1 = require("./dto/ai-chat.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const roles_guard_2 = require("../auth/roles.guard");
const public_decorator_1 = require("../auth/public.decorator");
let AiController = class AiController {
    aiService;
    aiLogs;
    constructor(aiService, aiLogs) {
        this.aiService = aiService;
        this.aiLogs = aiLogs;
    }
    async chat(dto) {
        if (!dto.message?.trim())
            return {
                reply: 'Por favor escribe un mensaje.',
                transfer: false,
                showFeedback: false,
            };
        return this.aiService.chat(dto.message, dto.history ?? [], dto.clientName ?? '', dto.colegio ?? '', dto.tipoSolicitud ?? '', dto.rol ?? 'estudiante');
    }
    async improveWhatsappDraft(body) {
        if (!body.draft?.trim())
            return { reply: '' };
        return this.aiService.improveWhatsappDraft(body.draft, {
            clientName: body.clientName ?? '',
            institution: body.institution ?? '',
            role: body.role ?? '',
        });
    }
    async summarizeWhatsapp(body) {
        return this.aiService.summarizeWhatsappConversation(body);
    }
    async stream(dto, res) {
        if (!dto.message?.trim()) {
            res.status(400).json({ error: 'Mensaje vacío' });
            return;
        }
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const emit = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            res.flush?.();
        };
        try {
            emit('start', { message: 'Procesando...' });
            await this.aiService.chatStream(dto.message, dto.history ?? [], dto.clientName ?? '', dto.colegio ?? '', dto.tipoSolicitud ?? '', dto.rol ?? 'estudiante', emit);
        }
        catch (err) {
            emit('error', { message: err?.message ?? 'Error interno' });
        }
        finally {
            emit('end', { message: 'Listo' });
            res.end();
        }
    }
    async feedback(body) {
        await this.aiLogs.actualizarFeedback(body.sessionId, body.pregunta, body.util);
        return { ok: true };
    }
    async listModels() {
        const apiKey = this.aiService.getApiKey();
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: {
                'x-goog-api-key': apiKey,
            },
        });
        const data = await res.json();
        const models = (data.models ?? []).map((m) => ({
            name: m.name,
            displayName: m.displayName,
            description: m.description,
            supportedGenerationMethods: m.supportedGenerationMethods,
        }));
        return { models };
    }
};
exports.AiController = AiController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_chat_dto_1.AiChatDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "chat", null);
__decorate([
    (0, common_1.Post)('whatsapp/improve'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "improveWhatsappDraft", null);
__decorate([
    (0, common_1.Post)('whatsapp/summary'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "summarizeWhatsapp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('stream'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_chat_dto_1.AiChatDto, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "stream", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('feedback'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "feedback", null);
__decorate([
    (0, roles_guard_2.Roles)('admin'),
    (0, common_1.Get)('models'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "listModels", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)('ai'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        ai_logs_service_1.AiLogsService])
], AiController);
//# sourceMappingURL=ai.controller.js.map