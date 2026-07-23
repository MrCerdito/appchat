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
exports.Ticket = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../auth/entities/user.entity");
let Ticket = class Ticket {
    id;
    codigo;
    titulo;
    descripcion;
    status;
    priority;
    category;
    sourceType;
    sourceId;
    conversation;
    assignedTo;
    assignedToName;
    clientName;
    clientInfo;
    createdBy;
    createdAt;
    updatedAt;
    closedAt;
    closedBy;
};
exports.Ticket = Ticket;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Ticket.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, unique: true }),
    __metadata("design:type", String)
], Ticket.prototype, "codigo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Ticket.prototype, "titulo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Ticket.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'open' }),
    __metadata("design:type", String)
], Ticket.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'medium' }),
    __metadata("design:type", String)
], Ticket.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Ticket.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_type', type: 'varchar', length: 20 }),
    __metadata("design:type", String)
], Ticket.prototype, "sourceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_id', type: 'varchar', length: 64, nullable: true }),
    __metadata("design:type", Object)
], Ticket.prototype, "sourceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], Ticket.prototype, "conversation", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'assigned_to_id' }),
    __metadata("design:type", Object)
], Ticket.prototype, "assignedTo", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'assigned_to_name',
        type: 'varchar',
        length: 255,
        nullable: true,
    }),
    __metadata("design:type", Object)
], Ticket.prototype, "assignedToName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'client_name', type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Ticket.prototype, "clientName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], Ticket.prototype, "clientInfo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'created_by_id' }),
    __metadata("design:type", Object)
], Ticket.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], Ticket.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], Ticket.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'closed_at', nullable: true, type: 'timestamp' }),
    __metadata("design:type", Object)
], Ticket.prototype, "closedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'closed_by_id' }),
    __metadata("design:type", Object)
], Ticket.prototype, "closedBy", void 0);
exports.Ticket = Ticket = __decorate([
    (0, typeorm_1.Entity)('tickets'),
    (0, typeorm_1.Index)('idx_tickets_status', ['status']),
    (0, typeorm_1.Index)('idx_tickets_priority', ['priority']),
    (0, typeorm_1.Index)('idx_tickets_source', ['sourceType', 'sourceId']),
    (0, typeorm_1.Index)('idx_tickets_assigned', ['assignedTo']),
    (0, typeorm_1.Index)('idx_tickets_created_by', ['createdBy']),
    (0, typeorm_1.Index)('idx_tickets_status_created_at', ['status', 'createdAt'])
], Ticket);
//# sourceMappingURL=ticket.entity.js.map