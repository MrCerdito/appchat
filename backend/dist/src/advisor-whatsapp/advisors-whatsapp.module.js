"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvisorsWhatsappModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const auth_module_1 = require("../auth/auth.module");
const user_entity_1 = require("../auth/entities/user.entity");
const configuracion_module_1 = require("../configuracion/configuracion.module");
const tickets_module_1 = require("../tickets/tickets.module");
const advisors_whatsapp_controller_1 = require("./advisors-whatsapp.controller");
const advisors_whatsapp_service_1 = require("./advisors-whatsapp.service");
const advisors_whatsapp_gateway_1 = require("./advisors-whatsapp.gateway");
const teams_meetings_service_1 = require("./teams-meetings.service");
const teams_token_entity_1 = require("./entities/teams-token.entity");
const whatsapp_chat_entity_1 = require("./entities/whatsapp-chat.entity");
const whatsapp_message_entity_1 = require("./entities/whatsapp-message.entity");
let AdvisorsWhatsappModule = class AdvisorsWhatsappModule {
};
exports.AdvisorsWhatsappModule = AdvisorsWhatsappModule;
exports.AdvisorsWhatsappModule = AdvisorsWhatsappModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([whatsapp_chat_entity_1.WhatsappChat, whatsapp_message_entity_1.WhatsappMessage, teams_token_entity_1.TeamsToken, user_entity_1.User]),
            auth_module_1.AuthModule,
            configuracion_module_1.ConfiguracionModule,
            tickets_module_1.TicketsModule,
        ],
        controllers: [advisors_whatsapp_controller_1.AdvisorsWhatsappController],
        providers: [
            advisors_whatsapp_service_1.AdvisorsWhatsappService,
            advisors_whatsapp_gateway_1.AdvisorsWhatsappGateway,
            teams_meetings_service_1.TeamsMeetingsService,
        ],
        exports: [advisors_whatsapp_service_1.AdvisorsWhatsappService],
    })
], AdvisorsWhatsappModule);
//# sourceMappingURL=advisors-whatsapp.module.js.map