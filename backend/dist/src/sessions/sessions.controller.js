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
var SessionsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsController = exports.CreateSessionDto = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sessions_service_1 = require("./sessions.service");
const tickets_service_1 = require("../tickets/tickets.service");
const message_entity_1 = require("../chat/entities/message.entity");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const class_validator_1 = require("class-validator");
const chat_gateway_1 = require("../chat/chat.gateway");
class CreateSessionDto {
    clientName;
    identificacion;
    apellido;
    rol;
    colegio;
    colegioLink;
    tipoSolicitud;
}
exports.CreateSessionDto = CreateSessionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Length)(1, 100),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "clientName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Length)(1, 20),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "identificacion", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Length)(1, 100),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "apellido", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Length)(1, 50),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "rol", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Length)(1, 100),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "colegio", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateSessionDto.prototype, "colegioLink", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Length)(1, 100),
    __metadata("design:type", String)
], CreateSessionDto.prototype, "tipoSolicitud", void 0);
let SessionsController = SessionsController_1 = class SessionsController {
    sessionsService;
    ticketsService;
    messageRepo;
    chatGateway;
    logger = new common_1.Logger(SessionsController_1.name);
    constructor(sessionsService, ticketsService, messageRepo, chatGateway) {
        this.sessionsService = sessionsService;
        this.ticketsService = ticketsService;
        this.messageRepo = messageRepo;
        this.chatGateway = chatGateway;
    }
    create(dto) {
        return this.sessionsService.create(dto);
    }
    findAll(req) {
        return this.sessionsService.findAll(req.user.id);
    }
    findAllPaginated(req, page = '1', limit = '50') {
        return this.sessionsService.findAllPaginated(req.user.id, +page, +limit);
    }
    async findAdvisors() {
        const advisors = await this.sessionsService.findAllAdvisors();
        return advisors.map((a) => ({
            ...a,
            status: (this.chatGateway.advisorStatuses.has(a.id)
                ? this.chatGateway.advisorStatuses.get(a.id)
                : a.status),
        }));
    }
    findWaiting() {
        return this.sessionsService.findWaitingSessions();
    }
    getMetrics() {
        return this.sessionsService.getMetrics();
    }
    getMetricsByAdvisor(id, tz) {
        return this.sessionsService.getMetricsByAdvisor(id, tz);
    }
    findAllAdmin() {
        return this.sessionsService.findAllAdmin();
    }
    findAllAdminPaginated(page = '1', limit = '50') {
        return this.sessionsService.findAllAdminPaginated(+page, +limit);
    }
    findColegios() {
        return this.sessionsService.findAllColegios();
    }
    getRankingAsesores() {
        return this.sessionsService.getRankingAsesores();
    }
    getComentariosByAdvisor(id, page = '1', limit = '10') {
        return this.sessionsService.getComentariosByAdvisor(id, +page, +limit);
    }
    getAllComentarios(page = '1', limit = '10', advisorId) {
        return this.sessionsService.getAllComentarios(+page, +limit, advisorId);
    }
    setMyStatus(status, req) {
        const advisorId = req.user.id;
        return this.sessionsService
            .setAdvisorStatus(advisorId, status)
            .then(() => ({ ok: true }));
    }
    takeOver(id, req) {
        return this.sessionsService.takeOver(id, req.user.id);
    }
    async findOne(id, req) {
        const session = await this.sessionsService.findOne(id);
        const userRole = req.user.role;
        if (userRole === 'estudiante' || userRole === 'padre') {
            if (session.advisor?.id !== req.user.id) {
                throw new common_1.ForbiddenException('No autorizado para ver esta sesión');
            }
        }
        return session;
    }
    findCodigo(id) {
        return this.sessionsService.findCodigo(id);
    }
    getMessages(id) {
        return this.sessionsService.getMessages(id);
    }
    async close(id, req) {
        const session = await this.sessionsService.findOne(id);
        const userRole = req.user.role;
        if (userRole === 'administrador' || session.advisor?.id === req.user.id) {
            return this.sessionsService.close(id);
        }
        throw new common_1.ForbiddenException('Solo el asesor asignado o un administrador puede cerrar la sesión');
    }
    async closeAnonymous(id) {
        return this.sessionsService.close(id);
    }
    async saveRating(id, body, req) {
        const session = await this.sessionsService.findOne(id);
        if (req.user.role === 'estudiante' || req.user.role === 'padre') {
            if (session.clientName !== req.user.name) {
                throw new common_1.ForbiddenException('Solo el cliente que inició la sesión puede calificar');
            }
        }
        return this.sessionsService.saveRating(id, body.estrellas, body.comentario ?? null, body.etiquetas ?? []);
    }
    getRating(id) {
        return this.sessionsService.getRating(id);
    }
    async createTicketFromSession(id, body, req) {
        const session = await this.sessionsService.findOne(id);
        const messages = await this.messageRepo.find({
            where: { session: { id } },
            order: { createdAt: 'DESC' },
            take: 100,
        });
        messages.reverse();
        const conversation = messages.map((m) => ({
            role: m.senderType === 'client' ? 'client' : 'advisor',
            name: m.senderName,
            content: m.content,
            timestamp: m.createdAt,
        }));
        const dto = {
            titulo: body.titulo ?? `Ticket desde sesion ${session.codigo || id}`,
            descripcion: body.descripcion ?? undefined,
            priority: body.priority ?? 'medium',
            category: body.category ?? undefined,
            sourceType: 'web',
            sourceId: id,
            clientName: `${session.clientName || ''} ${session.apellido || ''}`.trim() ||
                'Cliente',
            clientInfo: {
                identificacion: session.identificacion,
                rol: session.rol,
                colegio: session.colegio,
                tipoSolicitud: session.tipoSolicitud,
            },
            conversation,
        };
        return this.ticketsService.create(dto, req.user.id);
    }
};
exports.SessionsController = SessionsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateSessionDto]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('paginated'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findAllPaginated", null);
__decorate([
    (0, common_1.Get)('advisors'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "findAdvisors", null);
__decorate([
    (0, common_1.Get)('waiting'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findWaiting", null);
__decorate([
    (0, common_1.Get)('metrics'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getMetrics", null);
__decorate([
    (0, common_1.Get)('metrics/asesor/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('tz')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getMetricsByAdvisor", null);
__decorate([
    (0, common_1.Get)('admin/all'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findAllAdmin", null);
__decorate([
    (0, common_1.Get)('admin/all/paginated'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findAllAdminPaginated", null);
__decorate([
    (0, common_1.Get)('colegios/list'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findColegios", null);
__decorate([
    (0, common_1.Get)('metrics/ranking'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getRankingAsesores", null);
__decorate([
    (0, common_1.Get)('metrics/asesor/:id/comentarios'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getComentariosByAdvisor", null);
__decorate([
    (0, common_1.Get)('admin/comentarios'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('advisorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getAllComentarios", null);
__decorate([
    (0, common_1.Patch)('advisor/status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)('status')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "setMyStatus", null);
__decorate([
    (0, common_1.Patch)(':id/takeover'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "takeOver", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/codigo'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "findCodigo", null);
__decorate([
    (0, common_1.Get)(':id/messages'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)(':id/close'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "close", null);
__decorate([
    (0, common_1.Post)(':id/close-anonymous'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "closeAnonymous", null);
__decorate([
    (0, common_1.Post)(':id/rating'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "saveRating", null);
__decorate([
    (0, common_1.Get)(':id/rating'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SessionsController.prototype, "getRating", null);
__decorate([
    (0, common_1.Post)(':id/ticket'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "createTicketFromSession", null);
exports.SessionsController = SessionsController = SessionsController_1 = __decorate([
    (0, common_1.Controller)('sessions'),
    __param(2, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => chat_gateway_1.ChatGateway))),
    __metadata("design:paramtypes", [sessions_service_1.SessionsService,
        tickets_service_1.TicketsService,
        typeorm_2.Repository,
        chat_gateway_1.ChatGateway])
], SessionsController);
//# sourceMappingURL=sessions.controller.js.map