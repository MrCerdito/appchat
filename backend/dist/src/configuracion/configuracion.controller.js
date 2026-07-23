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
exports.ConfiguracionController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const public_decorator_1 = require("../auth/public.decorator");
const configuracion_service_1 = require("./configuracion.service");
const guardar_config_global_dto_1 = require("./dto/guardar-config-global.dto");
const guardar_config_advisor_dto_1 = require("./dto/guardar-config-advisor.dto");
let ConfiguracionController = class ConfiguracionController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    horarioHoy() {
        return this.svc.getHorarioEstado();
    }
    getEfectiva(req) {
        return this.svc.getEfectiva(req.user.id);
    }
    getGlobal() {
        return this.svc.getGlobal();
    }
    guardar(body, req) {
        return this.svc.guardar(body, req.user.id);
    }
    guardarGlobal(body) {
        return this.svc.guardar(body, undefined);
    }
    async getQuickReplies() {
        const config = await this.svc.getGlobal();
        return config.whatsappQuickReplies ?? [];
    }
    guardarQuickReplies(body) {
        return this.svc.guardar({ whatsappQuickReplies: body.whatsappQuickReplies }, undefined);
    }
    resetear(req) {
        return this.svc.resetearOverride(req.user.id);
    }
    getTicketCategories() {
        return this.svc.getGlobal().then((c) => c.ticketCategories ?? []);
    }
};
exports.ConfiguracionController = ConfiguracionController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
    (0, common_1.Get)('horario-hoy'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "horarioHoy", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "getEfectiva", null);
__decorate([
    (0, common_1.Get)('global'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_guard_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "getGlobal", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [guardar_config_advisor_dto_1.GuardarConfigAdvisorDto, Object]),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "guardar", null);
__decorate([
    (0, common_1.Post)('global'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_guard_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [guardar_config_global_dto_1.GuardarConfigGlobalDto]),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "guardarGlobal", null);
__decorate([
    (0, common_1.Get)('quick-replies'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfiguracionController.prototype, "getQuickReplies", null);
__decorate([
    (0, common_1.Post)('quick-replies'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "guardarQuickReplies", null);
__decorate([
    (0, common_1.Delete)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "resetear", null);
__decorate([
    (0, common_1.Get)('ticket-categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ConfiguracionController.prototype, "getTicketCategories", null);
exports.ConfiguracionController = ConfiguracionController = __decorate([
    (0, common_1.Controller)('configuracion'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [configuracion_service_1.ConfiguracionService])
], ConfiguracionController);
//# sourceMappingURL=configuracion.controller.js.map