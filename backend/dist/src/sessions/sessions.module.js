"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const sessions_service_1 = require("./sessions.service");
const sessions_controller_1 = require("./sessions.controller");
const session_entity_1 = require("./entities/session.entity");
const auth_module_1 = require("../auth/auth.module");
const user_entity_1 = require("../auth/entities/user.entity");
const message_entity_1 = require("../chat/entities/message.entity");
const colegio_entity_1 = require("./entities/colegio.entity");
const rating_entity_1 = require("./entities/rating.entity");
const tickets_module_1 = require("../tickets/tickets.module");
const chat_module_1 = require("../chat/chat.module");
let SessionsModule = class SessionsModule {
};
exports.SessionsModule = SessionsModule;
exports.SessionsModule = SessionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([session_entity_1.Session, user_entity_1.User, message_entity_1.Message, colegio_entity_1.Colegio, rating_entity_1.Rating]),
            auth_module_1.AuthModule,
            tickets_module_1.TicketsModule,
            (0, common_1.forwardRef)(() => chat_module_1.ChatModule),
        ],
        controllers: [sessions_controller_1.SessionsController],
        providers: [sessions_service_1.SessionsService],
        exports: [sessions_service_1.SessionsService],
    })
], SessionsModule);
//# sourceMappingURL=sessions.module.js.map