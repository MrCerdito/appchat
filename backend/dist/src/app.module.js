"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const Joi = __importStar(require("joi"));
const auth_module_1 = require("./auth/auth.module");
const sessions_module_1 = require("./sessions/sessions.module");
const chat_module_1 = require("./chat/chat.module");
const user_entity_1 = require("./auth/entities/user.entity");
const session_entity_1 = require("./sessions/entities/session.entity");
const message_entity_1 = require("./chat/entities/message.entity");
const colegio_entity_1 = require("./sessions/entities/colegio.entity");
const comunicados_module_1 = require("./comunicados/comunicados.module");
const comunicado_entity_1 = require("./comunicados/entities/comunicado.entity");
const track_module_1 = require("./track/track.module");
const comunicado_evento_entity_1 = require("./comunicados/entities/comunicado-evento.entity");
const rating_entity_1 = require("./sessions/entities/rating.entity");
const ai_module_1 = require("./ai/ai.module");
const documentos_module_1 = require("./documentos/documentos.module");
const documento_entity_1 = require("./documentos/entities/documento.entity");
const configuracion_module_1 = require("./configuracion/configuracion.module");
const configuracion_entity_1 = require("./configuracion/entities/configuracion.entity");
const advisors_module_1 = require("./advisors/advisors.module");
const widget_config_module_1 = require("./widget/widget-config.module");
const widget_config_entity_1 = require("./widget/entities/widget-config.entity");
const ai_log_entity_1 = require("./ai/entities/ai-log.entity");
const advisors_whatsapp_module_1 = require("./advisor-whatsapp/advisors-whatsapp.module");
const teams_token_entity_1 = require("./advisor-whatsapp/entities/teams-token.entity");
const whatsapp_chat_entity_1 = require("./advisor-whatsapp/entities/whatsapp-chat.entity");
const whatsapp_message_entity_1 = require("./advisor-whatsapp/entities/whatsapp-message.entity");
const faq_module_1 = require("./faq/faq.module");
const faq_entity_1 = require("./faq/entities/faq.entity");
const tickets_module_1 = require("./tickets/tickets.module");
const ticket_entity_1 = require("./tickets/ticket.entity");
const seed_module_1 = require("./seed/seed.module");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60000,
                    limit: 60,
                },
            ]),
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
                validationSchema: Joi.object({
                    DB_HOST: Joi.string().required(),
                    DB_PORT: Joi.number().default(5432),
                    DB_USER: Joi.string().required(),
                    DB_PASS: Joi.string().required(),
                    DB_NAME: Joi.string().required(),
                    JWT_SECRET: Joi.string().min(16).required().label('JWT_SECRET'),
                    JWT_REFRESH_SECRET: Joi.string()
                        .min(16)
                        .required()
                        .label('JWT_REFRESH_SECRET'),
                    JWT_EXPIRES: Joi.string().default('8h'),
                    GEMINI_API_KEY: Joi.string().optional(),
                    CHAT_ENCRYPTION_KEY: Joi.string()
                        .hex()
                        .length(64)
                        .optional()
                        .label('CHAT_ENCRYPTION_KEY'),
                    RESEND_API_KEY: Joi.string().optional(),
                    PORT: Joi.number().default(3001),
                    NODE_ENV: Joi.string()
                        .valid('development', 'production', 'test')
                        .default('development'),
                    CORS_ORIGINS: Joi.string().optional(),
                    APP_URL: Joi.string().uri().optional(),
                }),
                validationOptions: {
                    abortEarly: true,
                    allowUnknown: true,
                },
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    type: 'postgres',
                    host: config.get('DB_HOST'),
                    port: parseInt(config.get('DB_PORT'), 10),
                    username: config.get('DB_USER'),
                    password: config.get('DB_PASS'),
                    database: config.get('DB_NAME'),
                    timezone: 'UTC',
                    extra: {
                        max: 20,
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 5000,
                    },
                    entities: [
                        user_entity_1.User,
                        session_entity_1.Session,
                        message_entity_1.Message,
                        colegio_entity_1.Colegio,
                        comunicado_entity_1.Comunicado,
                        comunicado_evento_entity_1.ComunicadoEvento,
                        rating_entity_1.Rating,
                        documento_entity_1.Documento,
                        configuracion_entity_1.Configuracion,
                        widget_config_entity_1.WidgetConfig,
                        ai_log_entity_1.AiLog,
                        teams_token_entity_1.TeamsToken,
                        whatsapp_chat_entity_1.WhatsappChat,
                        whatsapp_message_entity_1.WhatsappMessage,
                        faq_entity_1.Faq,
                        ticket_entity_1.Ticket,
                    ],
                    synchronize: config.get('NODE_ENV') !== 'production',
                    logging: false,
                }),
            }),
            auth_module_1.AuthModule,
            sessions_module_1.SessionsModule,
            chat_module_1.ChatModule,
            comunicados_module_1.ComunicadosModule,
            track_module_1.TrackModule,
            ai_module_1.AiModule,
            advisors_module_1.AdvisorsModule,
            documentos_module_1.DocumentosModule,
            configuracion_module_1.ConfiguracionModule,
            widget_config_module_1.WidgetConfigModule,
            advisors_whatsapp_module_1.AdvisorsWhatsappModule,
            faq_module_1.FaqModule,
            tickets_module_1.TicketsModule,
            seed_module_1.SeedModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map