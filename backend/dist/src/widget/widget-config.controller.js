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
exports.WidgetConfigController = void 0;
const common_1 = require("@nestjs/common");
const widget_config_service_1 = require("./widget-config.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const save_widget_config_dto_1 = require("./dto/save-widget-config.dto");
let WidgetConfigController = class WidgetConfigController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    get() {
        return this.svc.get();
    }
    save(body) {
        return this.svc.save(body);
    }
    reset() {
        return this.svc.reset();
    }
};
exports.WidgetConfigController = WidgetConfigController;
__decorate([
    (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WidgetConfigController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [save_widget_config_dto_1.SaveWidgetConfigDto]),
    __metadata("design:returntype", Promise)
], WidgetConfigController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WidgetConfigController.prototype, "reset", null);
exports.WidgetConfigController = WidgetConfigController = __decorate([
    (0, common_1.Controller)('widget-config'),
    __metadata("design:paramtypes", [widget_config_service_1.WidgetConfigService])
], WidgetConfigController);
//# sourceMappingURL=widget-config.controller.js.map