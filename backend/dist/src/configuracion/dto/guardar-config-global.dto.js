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
exports.GuardarConfigGlobalDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class GuardarConfigGlobalDto {
    mensajeBienvenida;
    asesorInactividadSeg;
    asesorInactividadMsg;
    clienteInactividadSeg;
    clienteInactividadMsg;
    clienteInactividadIters;
    clienteCierreMsg;
    horarios;
    horarioFueraMsg;
    horariosActivos;
    almuerzos;
    whatsappAssignmentMsg;
    whatsappQueueMsg;
    whatsappOutOfHoursMsg;
    whatsappCallUnavailableMsg;
    whatsappQuickReplies;
    ticketCategories;
    sonidoActivado;
    sonidoWhatsapp;
    sonidoAsesor;
    sonidoCliente;
    sonidoAsignacion;
    aiPromptConfig;
}
exports.GuardarConfigGlobalDto = GuardarConfigGlobalDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "mensajeBienvenida", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(10),
    (0, class_validator_1.Max)(3600),
    __metadata("design:type", Number)
], GuardarConfigGlobalDto.prototype, "asesorInactividadSeg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "asesorInactividadMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(10),
    (0, class_validator_1.Max)(3600),
    __metadata("design:type", Number)
], GuardarConfigGlobalDto.prototype, "clienteInactividadSeg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "clienteInactividadMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], GuardarConfigGlobalDto.prototype, "clienteInactividadIters", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "clienteCierreMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => HorarioSlotObject),
    __metadata("design:type", Array)
], GuardarConfigGlobalDto.prototype, "horarios", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "horarioFueraMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GuardarConfigGlobalDto.prototype, "horariosActivos", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => HorarioAlmuerzoObject),
    __metadata("design:type", Array)
], GuardarConfigGlobalDto.prototype, "almuerzos", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "whatsappAssignmentMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "whatsappQueueMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "whatsappOutOfHoursMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "whatsappCallUnavailableMsg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], GuardarConfigGlobalDto.prototype, "whatsappQuickReplies", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MaxLength)(100, { each: true }),
    __metadata("design:type", Array)
], GuardarConfigGlobalDto.prototype, "ticketCategories", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GuardarConfigGlobalDto.prototype, "sonidoActivado", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "sonidoWhatsapp", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "sonidoAsesor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "sonidoCliente", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], GuardarConfigGlobalDto.prototype, "sonidoAsignacion", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], GuardarConfigGlobalDto.prototype, "aiPromptConfig", void 0);
class HorarioSlotObject {
    dia;
    inicio;
    fin;
}
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(6),
    __metadata("design:type", Number)
], HorarioSlotObject.prototype, "dia", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HorarioSlotObject.prototype, "inicio", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], HorarioSlotObject.prototype, "fin", void 0);
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
//# sourceMappingURL=guardar-config-global.dto.js.map