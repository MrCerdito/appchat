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
exports.ComunicadoEvento = void 0;
const typeorm_1 = require("typeorm");
const comunicado_entity_1 = require("./comunicado.entity");
let ComunicadoEvento = class ComunicadoEvento {
    id;
    comunicado;
    email;
    tipo;
    urlDestino;
    userAgent;
    ip;
    createdAt;
};
exports.ComunicadoEvento = ComunicadoEvento;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ComunicadoEvento.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => comunicado_entity_1.Comunicado, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'comunicado_id' }),
    __metadata("design:type", comunicado_entity_1.Comunicado)
], ComunicadoEvento.prototype, "comunicado", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 200 }),
    __metadata("design:type", String)
], ComunicadoEvento.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20 }),
    __metadata("design:type", String)
], ComunicadoEvento.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'url_destino', type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], ComunicadoEvento.prototype, "urlDestino", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_agent', type: 'varchar', length: 500, nullable: true }),
    __metadata("design:type", Object)
], ComunicadoEvento.prototype, "userAgent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], ComunicadoEvento.prototype, "ip", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], ComunicadoEvento.prototype, "createdAt", void 0);
exports.ComunicadoEvento = ComunicadoEvento = __decorate([
    (0, typeorm_1.Entity)('comunicado_eventos')
], ComunicadoEvento);
//# sourceMappingURL=comunicado-evento.entity.js.map