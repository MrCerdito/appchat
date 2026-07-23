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
exports.Comunicado = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../auth/entities/user.entity");
let Comunicado = class Comunicado {
    id;
    asunto;
    cuerpo;
    sender;
    senderName;
    status;
    destinatarios;
    createdAt;
    sentAt;
    totalEnviados;
    totalAperturas;
    totalClics;
};
exports.Comunicado = Comunicado;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Comunicado.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 300 }),
    __metadata("design:type", String)
], Comunicado.prototype, "asunto", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Comunicado.prototype, "cuerpo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'sender_id' }),
    __metadata("design:type", user_entity_1.User)
], Comunicado.prototype, "sender", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sender_name', length: 100 }),
    __metadata("design:type", String)
], Comunicado.prototype, "senderName", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, default: 'draft' }),
    __metadata("design:type", String)
], Comunicado.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: [] }),
    __metadata("design:type", Array)
], Comunicado.prototype, "destinatarios", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], Comunicado.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sent_at', nullable: true, type: 'timestamp' }),
    __metadata("design:type", Object)
], Comunicado.prototype, "sentAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_enviados', default: 0 }),
    __metadata("design:type", Number)
], Comunicado.prototype, "totalEnviados", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_aperturas', default: 0 }),
    __metadata("design:type", Number)
], Comunicado.prototype, "totalAperturas", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_clics', default: 0 }),
    __metadata("design:type", Number)
], Comunicado.prototype, "totalClics", void 0);
exports.Comunicado = Comunicado = __decorate([
    (0, typeorm_1.Entity)('comunicados'),
    (0, typeorm_1.Index)('idx_comunicados_sender_id', ['sender']),
    (0, typeorm_1.Index)('idx_comunicados_status', ['status']),
    (0, typeorm_1.Index)('idx_comunicados_sender_id_status', ['sender', 'status']),
    (0, typeorm_1.Index)('idx_comunicados_created_at', ['createdAt'])
], Comunicado);
//# sourceMappingURL=comunicado.entity.js.map