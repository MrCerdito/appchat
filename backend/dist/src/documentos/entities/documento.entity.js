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
exports.Documento = void 0;
const typeorm_1 = require("typeorm");
let Documento = class Documento {
    id;
    nombre;
    descripcion;
    contenido;
    chunkIndex;
    totalChunks;
    embedding;
    pdfPath;
    pdfUrl;
    colegio;
    categoria;
    rolesPermitidos;
    activo;
    createdAt;
};
exports.Documento = Documento;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Documento.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], Documento.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Documento.prototype, "contenido", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chunk_index', default: 0 }),
    __metadata("design:type", Number)
], Documento.prototype, "chunkIndex", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_chunks', default: 1 }),
    __metadata("design:type", Number)
], Documento.prototype, "totalChunks", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "embedding", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'pdf_path', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "pdfPath", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'pdf_url', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "pdfUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "colegio", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "categoria", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'roles_permitidos', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Documento.prototype, "rolesPermitidos", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Documento.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], Documento.prototype, "createdAt", void 0);
exports.Documento = Documento = __decorate([
    (0, typeorm_1.Entity)('documentos')
], Documento);
//# sourceMappingURL=documento.entity.js.map