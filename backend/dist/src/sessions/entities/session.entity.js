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
exports.Session = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../auth/entities/user.entity");
const message_entity_1 = require("../../chat/entities/message.entity");
const encrypted_text_transformer_1 = require("../../common/security/encrypted-text.transformer");
let Session = class Session {
    id;
    codigo;
    clientName;
    identificacion;
    apellido;
    rol;
    colegio;
    colegioLink;
    tipoSolicitud;
    status;
    advisor;
    createdAt;
    closedAt;
    messages;
};
exports.Session = Session;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Session.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, unique: true, nullable: true }),
    __metadata("design:type", Object)
], Session.prototype, "codigo", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'client_name',
        type: 'text',
        transformer: encrypted_text_transformer_1.encryptedTextTransformer,
    }),
    __metadata("design:type", String)
], Session.prototype, "clientName", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'text',
        nullable: true,
        transformer: encrypted_text_transformer_1.encryptedTextTransformer,
    }),
    __metadata("design:type", Object)
], Session.prototype, "identificacion", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'text',
        nullable: true,
        transformer: encrypted_text_transformer_1.encryptedTextTransformer,
    }),
    __metadata("design:type", Object)
], Session.prototype, "apellido", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], Session.prototype, "rol", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Session.prototype, "colegio", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'colegio_link',
        type: 'varchar',
        length: 500,
        nullable: true,
    }),
    __metadata("design:type", Object)
], Session.prototype, "colegioLink", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'tipo_solicitud',
        type: 'varchar',
        length: 100,
        nullable: true,
    }),
    __metadata("design:type", Object)
], Session.prototype, "tipoSolicitud", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, default: 'ai' }),
    __metadata("design:type", String)
], Session.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.sessions, {
        nullable: true,
        onDelete: 'SET NULL',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'advisor_id' }),
    __metadata("design:type", Object)
], Session.prototype, "advisor", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], Session.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'closed_at', nullable: true, type: 'timestamp' }),
    __metadata("design:type", Object)
], Session.prototype, "closedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.Message, (message) => message.session),
    __metadata("design:type", Array)
], Session.prototype, "messages", void 0);
exports.Session = Session = __decorate([
    (0, typeorm_1.Entity)('sessions'),
    (0, typeorm_1.Index)('idx_sessions_status', ['status']),
    (0, typeorm_1.Index)('idx_sessions_advisor_id', ['advisor']),
    (0, typeorm_1.Index)('idx_sessions_advisor_id_status', ['advisor', 'status']),
    (0, typeorm_1.Index)('idx_sessions_status_created_at', ['status', 'createdAt'])
], Session);
//# sourceMappingURL=session.entity.js.map