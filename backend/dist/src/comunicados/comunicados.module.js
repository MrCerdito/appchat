"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComunicadosModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const comunicados_controller_1 = require("./comunicados.controller");
const comunicados_service_1 = require("./comunicados.service");
const comunicado_entity_1 = require("./entities/comunicado.entity");
const comunicado_evento_entity_1 = require("./entities/comunicado-evento.entity");
const colegio_entity_1 = require("../sessions/entities/colegio.entity");
const auth_module_1 = require("../auth/auth.module");
let ComunicadosModule = class ComunicadosModule {
};
exports.ComunicadosModule = ComunicadosModule;
exports.ComunicadosModule = ComunicadosModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([comunicado_entity_1.Comunicado, comunicado_evento_entity_1.ComunicadoEvento, colegio_entity_1.Colegio]),
            auth_module_1.AuthModule,
        ],
        controllers: [comunicados_controller_1.ComunicadosController],
        providers: [comunicados_service_1.ComunicadosService],
        exports: [comunicados_service_1.ComunicadosService],
    })
], ComunicadosModule);
//# sourceMappingURL=comunicados.module.js.map