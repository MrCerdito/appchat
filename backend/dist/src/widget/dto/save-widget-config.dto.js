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
exports.SaveWidgetConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const POSICIONES = [
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
];
const FORMAS = ['circle', 'rounded'];
const TAMANOS = ['sm', 'md', 'lg'];
const ICONOS = ['chat', 'help', 'support'];
class SaveWidgetConfigDto {
    color;
    posicion;
    forma;
    tamano;
    icono;
    textoBoton;
    mostrarTexto;
    abrirAutomatico;
    delayAutoAbrir;
    mensajeBurbuja;
    mostrarBurbuja;
    chatUrl;
    tituloPanelChat;
    subtituloPanelChat;
    chatHeaderColor;
    chatBgColor;
    chatBubbleColor;
    chatBubbleUserColor;
    chatMarca;
}
exports.SaveWidgetConfigDto = SaveWidgetConfigDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsHexColor)(),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "color", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(POSICIONES),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "posicion", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(FORMAS),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "forma", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(TAMANOS),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "tamano", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(ICONOS),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "icono", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "textoBoton", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveWidgetConfigDto.prototype, "mostrarTexto", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveWidgetConfigDto.prototype, "abrirAutomatico", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(2),
    (0, class_validator_1.Max)(30),
    __metadata("design:type", Number)
], SaveWidgetConfigDto.prototype, "delayAutoAbrir", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(150),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "mensajeBurbuja", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveWidgetConfigDto.prototype, "mostrarBurbuja", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "chatUrl", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "tituloPanelChat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(150),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "subtituloPanelChat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsHexColor)(),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "chatHeaderColor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsHexColor)(),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "chatBgColor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsHexColor)(),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "chatBubbleColor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsHexColor)(),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "chatBubbleUserColor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], SaveWidgetConfigDto.prototype, "chatMarca", void 0);
//# sourceMappingURL=save-widget-config.dto.js.map