"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfiguracionModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const configuracion_service_1 = require("./configuracion.service");
const configuracion_controller_1 = require("./configuracion.controller");
const configuracion_entity_1 = require("./entities/configuracion.entity");
const auth_module_1 = require("../auth/auth.module");
const roles_guard_1 = require("../auth/roles.guard");
let ConfiguracionModule = class ConfiguracionModule {
};
exports.ConfiguracionModule = ConfiguracionModule;
exports.ConfiguracionModule = ConfiguracionModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([configuracion_entity_1.Configuracion]), auth_module_1.AuthModule],
        controllers: [configuracion_controller_1.ConfiguracionController],
        providers: [configuracion_service_1.ConfiguracionService, roles_guard_1.RolesGuard],
        exports: [configuracion_service_1.ConfiguracionService],
    })
], ConfiguracionModule);
//# sourceMappingURL=configuracion.module.js.map