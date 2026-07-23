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
exports.WhatsappChat = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../auth/entities/user.entity");
const whatsapp_message_entity_1 = require("./whatsapp-message.entity");
let WhatsappChat = class WhatsappChat {
    id;
    phone;
    jid;
    isGroup;
    name;
    profilePictureUrl;
    role;
    institution;
    institutionUrl;
    city;
    email;
    plan;
    modules;
    status;
    operationalStatus;
    operationalStatusUpdatedAt;
    assignedAdvisor;
    unreadCount;
    notes;
    tags;
    lastMessageAt;
    lastClientMessageAt;
    assignedAt;
    assignmentMode;
    fixedAdvisor;
    queueNoticeSent;
    outOfHoursNoticeSent;
    priority;
    messages;
    createdAt;
    updatedAt;
};
exports.WhatsappChat = WhatsappChat;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], WhatsappChat.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_whatsapp_chats_jid_unique', {
        unique: true,
        where: '"jid" IS NOT NULL',
    }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "jid", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_group', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WhatsappChat.prototype, "isGroup", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120 }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'profile_picture_url', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "profilePictureUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, default: 'Cliente WhatsApp' }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 160, default: 'WhatsApp' }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "institution", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'institution_url',
        type: 'varchar',
        length: 500,
        nullable: true,
    }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "institutionUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, default: '' }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "city", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 160, nullable: true }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120, default: 'WhatsApp' }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "plan", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => '\'["Atencion"]\'::jsonb' }),
    __metadata("design:type", Array)
], WhatsappChat.prototype, "modules", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'waiting' }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'operational_status',
        type: 'varchar',
        length: 30,
        default: 'new',
    }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "operationalStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'operational_status_updated_at',
        nullable: true,
        type: 'timestamp',
    }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "operationalStatusUpdatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'assigned_advisor_id' }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "assignedAdvisor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'unread_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], WhatsappChat.prototype, "unreadCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => "'[]'::jsonb" }),
    __metadata("design:type", Array)
], WhatsappChat.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => "'[]'::jsonb" }),
    __metadata("design:type", Array)
], WhatsappChat.prototype, "tags", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_message_at', nullable: true, type: 'timestamp' }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "lastMessageAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_client_message_at', nullable: true, type: 'timestamp' }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "lastClientMessageAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'assigned_at', nullable: true, type: 'timestamp' }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "assignedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'assignment_mode',
        type: 'varchar',
        length: 20,
        nullable: true,
    }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "assignmentMode", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'fixed_advisor_id' }),
    __metadata("design:type", Object)
], WhatsappChat.prototype, "fixedAdvisor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'queue_notice_sent', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WhatsappChat.prototype, "queueNoticeSent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'out_of_hours_notice_sent', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WhatsappChat.prototype, "outOfHoursNoticeSent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'normal' }),
    __metadata("design:type", String)
], WhatsappChat.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => whatsapp_message_entity_1.WhatsappMessage, (message) => message.chat),
    __metadata("design:type", Array)
], WhatsappChat.prototype, "messages", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], WhatsappChat.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], WhatsappChat.prototype, "updatedAt", void 0);
exports.WhatsappChat = WhatsappChat = __decorate([
    (0, typeorm_1.Entity)('whatsapp_chats'),
    (0, typeorm_1.Index)('idx_whatsapp_chats_assigned_advisor_id', ['assignedAdvisor']),
    (0, typeorm_1.Index)('idx_whatsapp_chats_fixed_advisor_id', ['fixedAdvisor']),
    (0, typeorm_1.Index)('idx_whatsapp_chats_status', ['status']),
    (0, typeorm_1.Index)('idx_whatsapp_chats_operational_status', ['operationalStatus']),
    (0, typeorm_1.Index)('idx_whatsapp_chats_assigned_advisor_id_status', [
        'assignedAdvisor',
        'status',
    ])
], WhatsappChat);
//# sourceMappingURL=whatsapp-chat.entity.js.map