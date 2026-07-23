"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const jwt_1 = require("@nestjs/jwt");
const chat_service_1 = require("./chat.service");
const chat_gateway_1 = require("./chat.gateway");
const message_entity_1 = require("./entities/message.entity");
const ai_module_1 = require("../ai/ai.module");
const sessions_module_1 = require("../sessions/sessions.module");
const configuracion_module_1 = require("../configuracion/configuracion.module");
const advisors_whatsapp_module_1 = require("../advisor-whatsapp/advisors-whatsapp.module");
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([message_entity_1.Message]),
            jwt_1.JwtModule,
            ai_module_1.AiModule,
            (0, common_1.forwardRef)(() => sessions_module_1.SessionsModule),
            configuracion_module_1.ConfiguracionModule,
            advisors_whatsapp_module_1.AdvisorsWhatsappModule,
        ],
        providers: [chat_service_1.ChatService, chat_gateway_1.ChatGateway],
        exports: [chat_service_1.ChatService, chat_gateway_1.ChatGateway],
    })
], ChatModule);
//# sourceMappingURL=chat.module.js.map