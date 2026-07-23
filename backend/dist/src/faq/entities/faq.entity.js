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
exports.Faq = void 0;
const typeorm_1 = require("typeorm");
let Faq = class Faq {
    id;
    pregunta;
    respuesta;
    categoria;
    keywords;
    colegioId;
    orden;
    activo;
    createdAt;
    updatedAt;
};
exports.Faq = Faq;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Faq.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Faq.prototype, "pregunta", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Faq.prototype, "respuesta", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_faqs_categoria'),
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Faq.prototype, "categoria", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-array', nullable: true }),
    __metadata("design:type", Object)
], Faq.prototype, "keywords", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_faqs_colegio_id'),
    (0, typeorm_1.Column)({ name: 'colegio_id', type: 'int', nullable: true }),
    __metadata("design:type", Object)
], Faq.prototype, "colegioId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_faqs_orden'),
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], Faq.prototype, "orden", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_faqs_activo'),
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], Faq.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], Faq.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], Faq.prototype, "updatedAt", void 0);
exports.Faq = Faq = __decorate([
    (0, typeorm_1.Entity)('faqs')
], Faq);
//# sourceMappingURL=faq.entity.js.map