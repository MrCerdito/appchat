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
exports.WhatsappMessage = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../auth/entities/user.entity");
const whatsapp_chat_entity_1 = require("./whatsapp-chat.entity");
const encrypted_text_transformer_1 = require("../../common/security/encrypted-text.transformer");
let WhatsappMessage = class WhatsappMessage {
    id;
    metaMessageId;
    chat;
    body;
    fromMe;
    senderName;
    participantJid;
    advisor;
    status;
    isAuto;
    type;
    mediaId;
    mediaUrl;
    mimeType;
    fileName;
    fileSize;
    editedAt;
    replyToMessageId;
    createdAt;
};
exports.WhatsappMessage = WhatsappMessage;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], WhatsappMessage.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({
        name: 'meta_message_id',
        type: 'varchar',
        length: 255,
        nullable: true,
    }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "metaMessageId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => whatsapp_chat_entity_1.WhatsappChat, (chat) => chat.messages, {
        onDelete: 'CASCADE',
    }),
    (0, typeorm_1.JoinColumn)({ name: 'chat_id' }),
    __metadata("design:type", whatsapp_chat_entity_1.WhatsappChat)
], WhatsappMessage.prototype, "chat", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', transformer: encrypted_text_transformer_1.encryptedTextTransformer }),
    __metadata("design:type", String)
], WhatsappMessage.prototype, "body", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'from_me', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WhatsappMessage.prototype, "fromMe", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sender_name', type: 'varchar', length: 120 }),
    __metadata("design:type", String)
], WhatsappMessage.prototype, "senderName", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'participant_jid',
        type: 'varchar',
        length: 100,
        nullable: true,
    }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "participantJid", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'advisor_id' }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "advisor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: 'delivered' }),
    __metadata("design:type", String)
], WhatsappMessage.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_auto', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WhatsappMessage.prototype, "isAuto", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 30, default: 'text' }),
    __metadata("design:type", String)
], WhatsappMessage.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'media_id', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "mediaId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'media_url', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "mediaUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mime_type', type: 'varchar', length: 120, nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'file_name', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "fileName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'file_size', type: 'int', nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'edited_at', type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "editedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reply_to_message_id', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], WhatsappMessage.prototype, "replyToMessageId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], WhatsappMessage.prototype, "createdAt", void 0);
exports.WhatsappMessage = WhatsappMessage = __decorate([
    (0, typeorm_1.Entity)('whatsapp_messages'),
    (0, typeorm_1.Index)('idx_whatsapp_messages_chat_id', ['chat']),
    (0, typeorm_1.Index)('idx_whatsapp_messages_chat_id_created_at', ['chat', 'createdAt'])
], WhatsappMessage);
//# sourceMappingURL=whatsapp-message.entity.js.map