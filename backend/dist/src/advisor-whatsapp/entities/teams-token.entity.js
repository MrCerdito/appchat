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
exports.TeamsToken = void 0;
const typeorm_1 = require("typeorm");
const encrypted_text_transformer_1 = require("../../common/security/encrypted-text.transformer");
let TeamsToken = class TeamsToken {
    id;
    advisorId;
    accessToken;
    refreshToken;
    expiresAt;
    accountName;
    createdAt;
    updatedAt;
};
exports.TeamsToken = TeamsToken;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TeamsToken.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'advisor_id', type: 'uuid', unique: true }),
    __metadata("design:type", String)
], TeamsToken.prototype, "advisorId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'access_token',
        type: 'text',
        transformer: encrypted_text_transformer_1.encryptedTextTransformer,
    }),
    __metadata("design:type", String)
], TeamsToken.prototype, "accessToken", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'refresh_token',
        type: 'text',
        nullable: true,
        transformer: encrypted_text_transformer_1.encryptedTextTransformer,
    }),
    __metadata("design:type", Object)
], TeamsToken.prototype, "refreshToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'bigint' }),
    __metadata("design:type", Number)
], TeamsToken.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'account_name',
        type: 'varchar',
        length: 255,
        nullable: true,
    }),
    __metadata("design:type", Object)
], TeamsToken.prototype, "accountName", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], TeamsToken.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], TeamsToken.prototype, "updatedAt", void 0);
exports.TeamsToken = TeamsToken = __decorate([
    (0, typeorm_1.Entity)('teams_tokens')
], TeamsToken);
//# sourceMappingURL=teams-token.entity.js.map