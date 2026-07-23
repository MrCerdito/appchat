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
exports.Configuracion = void 0;
const typeorm_1 = require("typeorm");
let Configuracion = class Configuracion {
    id;
    advisorId;
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
    whatsappAssignmentMsg;
    whatsappQueueMsg;
    whatsappOutOfHoursMsg;
    whatsappCallUnavailableMsg;
    whatsappQuickReplies;
    almuerzos;
    ticketCategories;
    sonidoActivado;
    sonidoWhatsapp;
    sonidoAsesor;
    sonidoCliente;
    sonidoAsignacion;
    aiPromptConfig;
    createdAt;
    updatedAt;
};
exports.Configuracion = Configuracion;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Configuracion.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'advisor_id', type: 'uuid', nullable: true, unique: true }),
    __metadata("design:type", Object)
], Configuracion.prototype, "advisorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mensaje_bienvenida', type: 'text' }),
    __metadata("design:type", String)
], Configuracion.prototype, "mensajeBienvenida", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'asesor_inactividad_seg', type: 'int', default: 120 }),
    __metadata("design:type", Number)
], Configuracion.prototype, "asesorInactividadSeg", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'asesor_inactividad_msg', type: 'text' }),
    __metadata("design:type", String)
], Configuracion.prototype, "asesorInactividadMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cliente_inactividad_seg', type: 'int', default: 180 }),
    __metadata("design:type", Number)
], Configuracion.prototype, "clienteInactividadSeg", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cliente_inactividad_msg', type: 'text' }),
    __metadata("design:type", String)
], Configuracion.prototype, "clienteInactividadMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cliente_inactividad_iters', type: 'int', default: 2 }),
    __metadata("design:type", Number)
], Configuracion.prototype, "clienteInactividadIters", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cliente_cierre_msg', type: 'text' }),
    __metadata("design:type", String)
], Configuracion.prototype, "clienteCierreMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: '[]' }),
    __metadata("design:type", Array)
], Configuracion.prototype, "horarios", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'horario_fuera_msg', type: 'text' }),
    __metadata("design:type", String)
], Configuracion.prototype, "horarioFueraMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'horarios_activos', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Configuracion.prototype, "horariosActivos", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'whatsapp_assignment_msg',
        type: 'text',
        default: 'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.',
    }),
    __metadata("design:type", String)
], Configuracion.prototype, "whatsappAssignmentMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'whatsapp_queue_msg',
        type: 'text',
        default: 'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.',
    }),
    __metadata("design:type", String)
], Configuracion.prototype, "whatsappQueueMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'whatsapp_out_of_hours_msg',
        type: 'text',
        default: 'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.',
    }),
    __metadata("design:type", String)
], Configuracion.prototype, "whatsappOutOfHoursMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'whatsapp_call_unavailable_msg',
        type: 'text',
        default: 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.',
    }),
    __metadata("design:type", String)
], Configuracion.prototype, "whatsappCallUnavailableMsg", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'whatsapp_quick_replies',
        type: 'jsonb',
        default: '[{"name":"Saludo","content":"Hola, con gusto reviso tu caso."},{"name":"Espera","content":"Dame un momento mientras valido la informacion."},{"name":"Despedida","content":"Quedo atento si necesitas algo mas."}]',
    }),
    __metadata("design:type", Array)
], Configuracion.prototype, "whatsappQuickReplies", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: '[]' }),
    __metadata("design:type", Array)
], Configuracion.prototype, "almuerzos", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'ticket_categories',
        type: 'jsonb',
        default: () => '\'["Soporte tecnico","Administrativo","Academico","Facturacion","Otro"]\'::jsonb',
    }),
    __metadata("design:type", Array)
], Configuracion.prototype, "ticketCategories", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sonido_activado', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Configuracion.prototype, "sonidoActivado", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sonido_whatsapp', length: 30, default: 'whatsapp1' }),
    __metadata("design:type", String)
], Configuracion.prototype, "sonidoWhatsapp", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sonido_asesor', length: 30, default: 'asesor1' }),
    __metadata("design:type", String)
], Configuracion.prototype, "sonidoAsesor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sonido_cliente', length: 30, default: 'cliente1' }),
    __metadata("design:type", String)
], Configuracion.prototype, "sonidoCliente", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sonido_asignacion', length: 30, default: 'asignacion1' }),
    __metadata("design:type", String)
], Configuracion.prototype, "sonidoAsignacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ai_prompt_config', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], Configuracion.prototype, "aiPromptConfig", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], Configuracion.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], Configuracion.prototype, "updatedAt", void 0);
exports.Configuracion = Configuracion = __decorate([
    (0, typeorm_1.Entity)('configuracion')
], Configuracion);
//# sourceMappingURL=configuracion.entity.js.map