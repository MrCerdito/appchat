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
var AdvisorsWhatsappController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvisorsWhatsappController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const config_1 = require("@nestjs/config");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const tickets_service_1 = require("../tickets/tickets.service");
const advisors_whatsapp_service_1 = require("./advisors-whatsapp.service");
const advisors_whatsapp_gateway_1 = require("./advisors-whatsapp.gateway");
const teams_meetings_service_1 = require("./teams-meetings.service");
const whatsapp_message_entity_1 = require("./entities/whatsapp-message.entity");
let AdvisorsWhatsappController = AdvisorsWhatsappController_1 = class AdvisorsWhatsappController {
    whatsappService;
    whatsappGateway;
    teamsService;
    config;
    ticketsService;
    waMessageRepo;
    logger = new common_1.Logger(AdvisorsWhatsappController_1.name);
    constructor(whatsappService, whatsappGateway, teamsService, config, ticketsService, waMessageRepo) {
        this.whatsappService = whatsappService;
        this.whatsappGateway = whatsappGateway;
        this.teamsService = teamsService;
        this.config = config;
        this.ticketsService = ticketsService;
        this.waMessageRepo = waMessageRepo;
    }
    verifyWebhook(mode, token, challenge) {
        const verifyToken = this.config.get('WHATSAPP_VERIFY_TOKEN') ?? 'token2025';
        if (mode === 'subscribe' && token === verifyToken) {
            this.logger.log('Webhook de asesores verificado por Meta.');
            return challenge;
        }
        this.logger.warn('Verificacion de webhook fallida.');
        return 'Error validating webhook';
    }
    receiveWebhook(_body) {
        this.logger.warn('Webhook Cloud API ignorado: el transporte activo es Baileys por QR.');
        return { ok: true, transport: 'baileys' };
    }
    listChats(req, page, limit) {
        const p = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
        const l = limit ? Math.min(100, Math.max(1, parseInt(limit, 10) || 50)) : undefined;
        return this.whatsappService.listChats(req.user.id, req.user.role, p, l);
    }
    getAdminDashboard(req) {
        return this.whatsappService.getAdminDashboard(req.user.role);
    }
    getConnection() {
        return this.whatsappService.getConnectionStatus();
    }
    restartConnection() {
        return this.whatsappService.restartConnection();
    }
    logoutConnection() {
        return this.whatsappService.logoutConnection();
    }
    getMessages(chatId, page = '1', limit = '50', req) {
        return this.whatsappService.getMessages(chatId, +page, +limit, req.user.id, req.user.role);
    }
    editMessage(chatId, messageId, body, req) {
        return this.whatsappService
            .editAdvisorMessage(chatId, messageId, req.user.id, req.user.role, body)
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    deleteMessage(chatId, messageId, req) {
        return this.whatsappService
            .deleteAdvisorMessage(chatId, messageId, req.user.id, req.user.role)
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    reactToMessage(chatId, messageId, emoji, req) {
        return this.whatsappService
            .reactToMessage(chatId, messageId, req.user.id, req.user.role, emoji ?? '')
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    saveNote(chatId, note, req) {
        return this.whatsappService
            .addNote(chatId, note, req.user.id, req.user.role)
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    deleteNote(chatId, index, req) {
        return this.whatsappService
            .deleteNote(chatId, +index, req.user.id, req.user.role)
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    updateTags(chatId, tags, req) {
        return this.whatsappService
            .updateTags(chatId, tags, req.user.id, req.user.role)
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    updateContact(chatId, body, req) {
        return this.whatsappService
            .updateContactInfo(chatId, body, req.user.id, req.user.role)
            .then((chat) => {
            this.whatsappGateway.emitChatUpdated(chat);
            return chat;
        });
    }
    markRead(chatId, req) {
        return this.whatsappService
            .markRead(chatId, req.user.id, req.user.role)
            .then(() => ({ ok: true }));
    }
    async takeChat(chatId, req) {
        const assignment = await this.whatsappService.takeQueuedChat(chatId, req.user.id, req.user.role);
        this.whatsappGateway.emitAssignments([assignment]);
        return assignment.chat;
    }
    async adminAssignChat(chatId, req, body) {
        const assignment = await this.whatsappService.adminAssignChat(chatId, body.advisorId, req.user.role, body.mode ?? 'admin', body.message);
        this.whatsappGateway.emitAssignments([assignment]);
        return assignment.chat;
    }
    async setFixedAdvisor(chatId, req, advisorId) {
        const chat = await this.whatsappService.setFixedAdvisor(chatId, advisorId, req.user.role);
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
    }
    async clearFixedAdvisor(chatId, req) {
        const chat = await this.whatsappService.clearFixedAdvisor(chatId, req.user.role);
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
    }
    async updateOperationalStatus(chatId, req, status) {
        const chat = await this.whatsappService.updateOperationalStatus(chatId, status, req.user.id, req.user.role);
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
    }
    async updateChatPriority(chatId, req, priority) {
        const chat = await this.whatsappService.updateChatPriority(chatId, priority, req.user.role);
        this.whatsappGateway.emitChatUpdated(chat);
        return chat;
    }
    async closeChat(chatId, req) {
        const closed = await this.whatsappService.closeChat(chatId, req.user.id, req.user.role);
        this.whatsappGateway.emitChatUpdated(closed);
        const assignments = await this.whatsappService.assignWaitingChats(this.whatsappGateway.getConnectedAdvisorIds());
        this.whatsappGateway.emitAssignments(assignments);
        return closed;
    }
    getQuickReplies() {
        return this.whatsappService.getQuickReplies();
    }
    getTeamsStatus(req) {
        return this.teamsService.getStatus(req.user.id);
    }
    getTeamsAuthUrl(req) {
        return this.teamsService.createAuthUrl(req.user.id);
    }
    async completeTeamsAuth(code, state, oauthError, oauthErrorDescription, res) {
        try {
            if (oauthError) {
                throw new Error(oauthErrorDescription || oauthError);
            }
            await this.teamsService.completeAuth(code, state);
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
            res.type('html').send(this.teamsCallbackHtml(true));
        }
        catch (err) {
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
            res
                .type('html')
                .status(400)
                .send(this.teamsCallbackHtml(false, err?.message));
        }
    }
    async createTeamsMeeting(chatId, req, body) {
        const chat = await this.whatsappService.getChatForAdvisor(chatId, req.user.id, req.user.role);
        const meeting = await this.teamsService.createMeeting(req.user.id, body);
        const text = this.teamsWhatsappText(meeting.subject, meeting.startDateTime, meeting.joinUrl);
        const result = await this.whatsappService.sendAdvisorText(req.user.id, req.user.role, chat.jid || chat.phone, text);
        this.whatsappGateway.emitIncoming({
            chat: result.chat,
            message: result.message,
            assignedAdvisorId: result.chat.assignedTo,
        });
        if (body.calendarTarget && body.calendarTarget !== 'none') {
            try {
                await this.teamsService.createCalendarEvent(req.user.id, body.calendarTarget, meeting, {
                    name: chat.name,
                    role: chat.role,
                    institution: chat.institution,
                    phone: chat.phone,
                    email: chat.email,
                });
            }
            catch (err) {
                this.logger.warn(`No se pudo agendar al calendario: ${err?.message ?? err}`);
            }
        }
        return { ok: true, meeting, chat: result.chat };
    }
    async sendMessage(_apiKey, req, body) {
        const { to, text } = body;
        if (!to || !text) {
            return { ok: false, error: 'Los campos "to" y "text" son obligatorios.' };
        }
        try {
            const result = await this.whatsappService.sendAdvisorText(req.user.id, req.user.role, to, text);
            this.whatsappGateway.emitIncoming({
                chat: result.chat,
                message: result.message,
                assignedAdvisorId: result.chat.assignedTo,
            });
            return { ok: true, messageId: result.message.id, chat: result.chat };
        }
        catch (err) {
            const metaError = err.response?.data;
            this.logger.error('Error enviando mensaje:', metaError ?? err.message);
            return { ok: false, error: metaError ?? err.message };
        }
    }
    async replyToMessage(req, chatId, messageId, body) {
        if (!body.text) {
            return { ok: false, error: 'El campo "text" es obligatorio.' };
        }
        const result = await this.whatsappService.replyToMessage(req.user.id, req.user.role, chatId, messageId, body.text);
        this.whatsappGateway.emitIncoming({
            chat: result.chat,
            message: result.message,
            assignedAdvisorId: result.chat.assignedTo,
        });
        return { ok: true, messageId: result.message.id, chat: result.chat };
    }
    async forwardMessage(req, chatId, messageId, body) {
        if (!body.targetChatId) {
            return { ok: false, error: 'El campo "targetChatId" es obligatorio.' };
        }
        const result = await this.whatsappService.forwardMessage(req.user.id, req.user.role, chatId, messageId, body.targetChatId);
        this.whatsappGateway.emitIncoming({
            chat: result.chat,
            message: result.message,
            assignedAdvisorId: result.chat.assignedTo,
        });
        return { ok: true, messageId: result.message.id, chat: result.chat };
    }
    async sendTemplate(_apiKey, req, body) {
        const { to, templateName, langCode = 'es_CO', components = [] } = body;
        if (!to || !templateName) {
            return {
                ok: false,
                error: 'Los campos "to" y "templateName" son obligatorios.',
            };
        }
        try {
            const result = await this.whatsappService.sendAdvisorTemplate(req.user.id, req.user.role, to, templateName, langCode, components);
            return {
                ok: true,
                messageId: result.messageId ?? result.message.id,
                chat: result.chat,
            };
        }
        catch (err) {
            const metaError = err.response?.data;
            this.logger.error('Error enviando plantilla:', metaError ?? err.message);
            return { ok: false, error: metaError ?? err.message };
        }
    }
    async sendMedia(req, file, body) {
        if (!body.to || !file) {
            return { ok: false, error: 'Los campos "to" y "file" son obligatorios.' };
        }
        const result = await this.whatsappService.sendAdvisorMedia(req.user.id, req.user.role, body.to, file, body.caption ?? '');
        this.whatsappGateway.emitIncoming({
            chat: result.chat,
            message: result.message,
            assignedAdvisorId: result.chat.assignedTo,
        });
        return { ok: true, messageId: result.message.id, chat: result.chat };
    }
    async createTicketFromWhatsapp(id, body, req) {
        const chat = await this.whatsappService.getChatById(id);
        const messages = await this.waMessageRepo.find({
            where: { chat: { id } },
            order: { createdAt: 'DESC' },
            take: 200,
        });
        messages.reverse();
        const conversation = messages.map((m) => ({
            role: m.fromMe ? 'advisor' : 'client',
            name: m.senderName || (m.fromMe ? 'Asesor' : chat.name),
            content: m.body,
            type: m.type || 'text',
            mediaUrl: m.mediaUrl || null,
            timestamp: m.createdAt,
        }));
        const dto = {
            titulo: body.titulo ?? `Ticket desde WhatsApp - ${chat.name}`,
            descripcion: body.descripcion ?? undefined,
            priority: body.priority ?? 'medium',
            category: body.category ?? undefined,
            sourceType: 'whatsapp',
            sourceId: id,
            clientName: chat.name || 'Cliente WhatsApp',
            clientInfo: {
                phone: chat.phone,
                institution: chat.institution,
                role: chat.role,
                city: chat.city,
            },
            conversation,
        };
        return this.ticketsService.create(dto, req.user.id);
    }
    teamsWhatsappText(subject, startDateTime, joinUrl) {
        const formatted = new Intl.DateTimeFormat('es-CO', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/Bogota',
        }).format(new Date(startDateTime));
        return `Hola, te comparto el enlace para nuestra reunion en Microsoft Teams.\n\nReunion: ${subject}\nHora: ${formatted}\nLink: ${joinUrl}`;
    }
    teamsCallbackHtml(success, error = '') {
        const title = success ? 'Teams conectado' : 'No se pudo conectar Teams';
        const safeTitle = this.escapeHtml(title);
        const message = success
            ? 'Ya puedes volver a InnovaCloud y crear la reunion.'
            : error || 'Autorizacion fallida';
        const safeMessage = this.escapeHtml(message);
        const payload = JSON.stringify({
            type: 'teams-auth',
            success,
            error: success ? '' : error || 'Autorizacion fallida',
        });
        return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1219;color:#edf4f7;font-family:Segoe UI,system-ui,sans-serif}main{max-width:460px;padding:28px;text-align:center}h1{font-size:22px}p{color:#93a4af;line-height:1.5}button{height:38px;padding:0 16px;border:0;border-radius:8px;background:#20c997;color:#04110d;font-weight:800;cursor:pointer}</style></head><body><main><h1>${safeTitle}</h1><p>${safeMessage}</p><button onclick="window.close()">Cerrar</button></main><script>try{window.opener&&window.opener.postMessage(${payload},'*')}catch(e){}</script></body></html>`;
    }
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};
exports.AdvisorsWhatsappController = AdvisorsWhatsappController;
__decorate([
    (0, common_1.Get)('webhook'),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.verify_token')),
    __param(2, (0, common_1.Query)('hub.challenge')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "verifyWebhook", null);
__decorate([
    (0, common_1.Post)('webhook'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "receiveWebhook", null);
__decorate([
    (0, common_1.Get)('chats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "listChats", null);
__decorate([
    (0, common_1.Get)('admin/dashboard'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "getAdminDashboard", null);
__decorate([
    (0, common_1.Get)('connection'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "getConnection", null);
__decorate([
    (0, common_1.Post)('connection/restart'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "restartConnection", null);
__decorate([
    (0, common_1.Post)('connection/logout'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "logoutConnection", null);
__decorate([
    (0, common_1.Get)('chats/:chatId/messages'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Patch)('chats/:chatId/messages/:messageId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('messageId')),
    __param(2, (0, common_1.Body)('body')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "editMessage", null);
__decorate([
    (0, common_1.Delete)('chats/:chatId/messages/:messageId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('messageId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "deleteMessage", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/messages/:messageId/reaction'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('messageId')),
    __param(2, (0, common_1.Body)('emoji')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "reactToMessage", null);
__decorate([
    (0, common_1.Patch)('chats/:chatId/note'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Body)('note')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "saveNote", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/notes/:index/delete'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('index')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "deleteNote", null);
__decorate([
    (0, common_1.Patch)('chats/:chatId/tags'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Body)('tags')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "updateTags", null);
__decorate([
    (0, common_1.Patch)('chats/:chatId/contact'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "updateContact", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/read'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "markRead", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/take'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "takeChat", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/admin-assign'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "adminAssignChat", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/fixed-advisor'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)('advisorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "setFixedAdvisor", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/fixed-advisor/delete'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "clearFixedAdvisor", null);
__decorate([
    (0, common_1.Patch)('chats/:chatId/operational-status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "updateOperationalStatus", null);
__decorate([
    (0, common_1.Patch)('chats/:chatId/priority'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)('priority')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "updateChatPriority", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/close'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "closeChat", null);
__decorate([
    (0, common_1.Get)('quick-replies'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "getQuickReplies", null);
__decorate([
    (0, common_1.Get)('teams/status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "getTeamsStatus", null);
__decorate([
    (0, common_1.Post)('teams/auth-url'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdvisorsWhatsappController.prototype, "getTeamsAuthUrl", null);
__decorate([
    (0, common_1.Get)('teams/oauth/callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('error')),
    __param(3, (0, common_1.Query)('error_description')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "completeTeamsAuth", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/teams-meeting'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "createTeamsMeeting", null);
__decorate([
    (0, common_1.Post)('send'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Headers)('x-api-key')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/messages/:messageId/reply'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('chatId')),
    __param(2, (0, common_1.Param)('messageId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "replyToMessage", null);
__decorate([
    (0, common_1.Post)('chats/:chatId/messages/:messageId/forward'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('chatId')),
    __param(2, (0, common_1.Param)('messageId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "forwardMessage", null);
__decorate([
    (0, common_1.Post)('send-template'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Headers)('x-api-key')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "sendTemplate", null);
__decorate([
    (0, common_1.Post)('send-media'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.memoryStorage)(),
        limits: { fileSize: 64 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "sendMedia", null);
__decorate([
    (0, common_1.Post)(':id/ticket'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdvisorsWhatsappController.prototype, "createTicketFromWhatsapp", null);
exports.AdvisorsWhatsappController = AdvisorsWhatsappController = AdvisorsWhatsappController_1 = __decorate([
    (0, common_1.Controller)('advisors-whatsapp'),
    __param(5, (0, typeorm_1.InjectRepository)(whatsapp_message_entity_1.WhatsappMessage)),
    __metadata("design:paramtypes", [advisors_whatsapp_service_1.AdvisorsWhatsappService,
        advisors_whatsapp_gateway_1.AdvisorsWhatsappGateway,
        teams_meetings_service_1.TeamsMeetingsService,
        config_1.ConfigService,
        tickets_service_1.TicketsService,
        typeorm_2.Repository])
], AdvisorsWhatsappController);
//# sourceMappingURL=advisors-whatsapp.controller.js.map