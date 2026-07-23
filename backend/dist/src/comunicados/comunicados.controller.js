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
exports.ComunicadosController = exports.ComunicadoDto = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/roles.guard");
const comunicados_service_1 = require("./comunicados.service");
const class_validator_1 = require("class-validator");
const public_decorator_1 = require("../auth/public.decorator");
class ComunicadoDto {
    asunto;
    cuerpo;
    destinatarios;
}
exports.ComunicadoDto = ComunicadoDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ComunicadoDto.prototype, "asunto", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ComunicadoDto.prototype, "cuerpo", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ComunicadoDto.prototype, "destinatarios", void 0);
let ComunicadosController = class ComunicadosController {
    service;
    constructor(service) {
        this.service = service;
    }
    findAll(req) {
        return this.service.findAll(req.user.id, req.user.role);
    }
    getColegios() {
        return this.service.getColegios();
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    saveDraft(dto, req) {
        return this.service.saveDraft(dto.asunto, dto.cuerpo, dto.destinatarios, req.user);
    }
    update(id, dto) {
        return this.service.updateDraft(id, dto.asunto, dto.cuerpo, dto.destinatarios);
    }
    async send(id) {
        const result = await this.service.send(id);
        if (result.status === 'failed') {
            throw new common_1.InternalServerErrorException('Ningún correo pudo ser entregado');
        }
        return result;
    }
    remove(id) {
        return this.service.remove(id);
    }
    getStats(id) {
        return this.service.getStats(id);
    }
    async resendWebhook(body) {
        const { type, data } = body;
        if (type === 'email.bounced' || type === 'email.delivery_delayed') {
            const email = data?.to?.[0];
            const reason = data?.bounce?.message ?? 'Rebote de correo';
            if (email) {
                await this.service.markBounced(email, reason);
            }
        }
        return { ok: true };
    }
};
exports.ComunicadosController = ComunicadosController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('colegios'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "getColegios", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "findOne", null);
__decorate([
    (0, roles_guard_1.Roles)('admin'),
    (0, common_1.Post)('draft'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ComunicadoDto, Object]),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "saveDraft", null);
__decorate([
    (0, roles_guard_1.Roles)('admin'),
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ComunicadoDto]),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "update", null);
__decorate([
    (0, roles_guard_1.Roles)('admin'),
    (0, common_1.Post)(':id/send'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ComunicadosController.prototype, "send", null);
__decorate([
    (0, roles_guard_1.Roles)('admin'),
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/stats'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ComunicadosController.prototype, "getStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhook/resend'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ComunicadosController.prototype, "resendWebhook", null);
exports.ComunicadosController = ComunicadosController = __decorate([
    (0, common_1.Controller)('comunicados'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [comunicados_service_1.ComunicadosService])
], ComunicadosController);
//# sourceMappingURL=comunicados.controller.js.map