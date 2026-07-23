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
exports.WidgetConfig = void 0;
const typeorm_1 = require("typeorm");
let WidgetConfig = class WidgetConfig {
    id;
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
    tituloPanelChat;
    subtituloPanelChat;
    chatUrl;
    chatHeaderColor;
    chatBgColor;
    chatBubbleColor;
    chatBubbleUserColor;
    chatMarca;
    createdAt;
    updatedAt;
};
exports.WidgetConfig = WidgetConfig;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], WidgetConfig.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: '#2563eb' }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "color", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'bottom-right' }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "posicion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10, default: 'circle' }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "forma", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 5, default: 'md' }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "tamano", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'chat' }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "icono", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'texto_boton', type: 'varchar', length: 60, default: '' }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "textoBoton", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mostrar_texto', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WidgetConfig.prototype, "mostrarTexto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'abrir_automatico', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WidgetConfig.prototype, "abrirAutomatico", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'delay_auto_abrir', type: 'int', default: 5 }),
    __metadata("design:type", Number)
], WidgetConfig.prototype, "delayAutoAbrir", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'mensaje_burbuja',
        type: 'varchar',
        length: 150,
        default: '¿Necesitas ayuda? ¡Chatea con nosotros!',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "mensajeBurbuja", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mostrar_burbuja', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], WidgetConfig.prototype, "mostrarBurbuja", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'titulo_panel',
        type: 'varchar',
        length: 100,
        default: 'Soporte en línea',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "tituloPanelChat", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'subtitulo_panel',
        type: 'varchar',
        length: 150,
        default: 'Estamos aquí para ayudarte',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "subtituloPanelChat", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'chat_url',
        type: 'varchar',
        length: 255,
        default: 'https://ia.innovacloud.co',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "chatUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'chat_header_color',
        type: 'varchar',
        length: 20,
        default: '#1a1a1a',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "chatHeaderColor", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'chat_bg_color',
        type: 'varchar',
        length: 20,
        default: '#f0ede9',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "chatBgColor", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'chat_bubble_color',
        type: 'varchar',
        length: 20,
        default: '#ffffff',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "chatBubbleColor", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'chat_bubble_user_color',
        type: 'varchar',
        length: 20,
        default: '#1a1a1a',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "chatBubbleUserColor", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'chat_marca',
        type: 'varchar',
        length: 80,
        default: 'Soporte en línea',
    }),
    __metadata("design:type", String)
], WidgetConfig.prototype, "chatMarca", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], WidgetConfig.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], WidgetConfig.prototype, "updatedAt", void 0);
exports.WidgetConfig = WidgetConfig = __decorate([
    (0, typeorm_1.Entity)('widget_config')
], WidgetConfig);
//# sourceMappingURL=widget-config.entity.js.map