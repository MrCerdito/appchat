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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuardarConfigAdvisorDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class HorarioAlmuerzoObject {
    dia;
    inicio;
    fin;
}
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(6),
    __metadata("design:type", Number)
], HorarioAlmuerzoObject.prototype, "dia", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HorarioAlmuerzoObject.prototype, "inicio", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HorarioAlmuerzoObject.prototype, "fin", void 0);
class GuardarConfigAdvisorDto {
    mensajeBienvenida;
    horarioFueraMsg;
    asesorInactividadSeg;
    asesorInactividadMsg;
    clienteInactividadSeg;
    clienteInactividadMsg;
    clienteInactividadIters;
    clienteCierreMsg;
    almuerzos;
    whatsappQuickReplies;
}
exports.GuardarConfigAdvisorDto = GuardarConfigAdvisorDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigAdvisorDto.prototype, "mensajeBienvenida", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigAdvisorDto.prototype, "horarioFueraMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(10),
    (0, class_validator_1.Max)(3600),
    __metadata("design:type", Number)
], GuardarConfigAdvisorDto.prototype, "asesorInactividadSeg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigAdvisorDto.prototype, "asesorInactividadMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(10),
    (0, class_validator_1.Max)(3600),
    __metadata("design:type", Number)
], GuardarConfigAdvisorDto.prototype, "clienteInactividadSeg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigAdvisorDto.prototype, "clienteInactividadMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], GuardarConfigAdvisorDto.prototype, "clienteInactividadIters", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigAdvisorDto.prototype, "clienteCierreMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => HorarioAlmuerzoObject),
    __metadata("design:type", Array)
], GuardarConfigAdvisorDto.prototype, "almuerzos", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], GuardarConfigAdvisorDto.prototype, "whatsappQuickReplies", void 0);
//# sourceMappingURL=guardar-config-advisor.dto.js.map