import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';
import { ChatModule } from './chat/chat.module';
import { User } from './auth/entities/user.entity';
import { Session } from './sessions/entities/session.entity';
import { Message } from './chat/entities/message.entity';
import { Colegio } from './sessions/entities/colegio.entity';
import { ComunicadosModule } from './comunicados/comunicados.module';
import { Comunicado } from './comunicados/entities/comunicado.entity';
import { TrackModule } from './track/track.module';
import { ComunicadoEvento } from './comunicados/entities/comunicado-evento.entity';
import { Rating } from './sessions/entities/rating.entity';
import { AiModule } from './ai/ai.module';
import { DocumentosModule } from './documentos/documentos.module';
import { Documento } from './documentos/entities/documento.entity';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { Configuracion } from './configuracion/entities/configuracion.entity';
import { AdvisorsModule } from './advisors/advisors.module';
import { WidgetConfigModule } from './widget/widget-config.module';
import { WidgetConfig } from './widget/entities/widget-config.entity';
import { AiLog } from './ai/entitites/ai-log.entity';
import { AdvisorsWhatsappModule } from './advisor-whatsapp/advisors-whatsapp.module';
import { TeamsToken } from './advisor-whatsapp/entities/teams-token.entity';
import { WhatsappChat } from './advisor-whatsapp/entities/whatsapp-chat.entity';
import { WhatsappMessage } from './advisor-whatsapp/entities/whatsapp-message.entity';
import { FaqModule } from './faq/faq.module';
import { Faq } from './faq/entities/faq.entity';
import { TicketsModule } from './tickets/tickets.module';
import { Ticket } from './tickets/ticket.entity';
import { SeedModule } from './seed/seed.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(5432),
        DB_USER: Joi.string().required(),
        DB_PASS: Joi.string().required(),
        DB_NAME: Joi.string().required(),
        JWT_SECRET: Joi.string().min(16).required().label('JWT_SECRET'),
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST') as string,
        port: parseInt(config.get<string>('DB_PORT') as string, 10),
        username: config.get<string>('DB_USER') as string,
        password: config.get<string>('DB_PASS') as string,
        database: config.get<string>('DB_NAME') as string,
        extra: {
          max: 50,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
        entities: [
          User,
          Session,
          Message,
          Colegio,
          Comunicado,
          ComunicadoEvento,
          Rating,
          Documento,
          Configuracion,
          WidgetConfig,
          AiLog,
          TeamsToken,
          WhatsappChat,
          WhatsappMessage,
          Faq,
          Ticket,
        ],
        synchronize: true,
        logging: false,
      }),
    }),
    AuthModule,
    SessionsModule,
    ChatModule,
    ComunicadosModule,
    TrackModule,
    AiModule,
    AdvisorsModule,
    DocumentosModule,
    ConfiguracionModule,
    WidgetConfigModule,
    AdvisorsWhatsappModule,
    FaqModule,
    TicketsModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
