import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { AuditLog } from './common/entities/audit-log.entity';
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
import { ComunicadoTemplate } from './comunicados/entities/comunicado-template.entity';
import { Rating } from './sessions/entities/rating.entity';
import { AiModule } from './ai/ai.module';
import { DocumentosModule } from './documentos/documentos.module';
import { Documento } from './documentos/entities/documento.entity';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { Configuracion } from './configuracion/entities/configuracion.entity';
import { AdvisorsModule } from './advisors/advisors.module';
import { WidgetConfigModule } from './widget/widget-config.module';
import { WidgetConfig } from './widget/entities/widget-config.entity';
import { AiLog } from './ai/entities/ai-log.entity';
import { AdvisorsWhatsappModule } from './advisor-whatsapp/advisors-whatsapp.module';
import { TeamsToken } from './advisor-whatsapp/entities/teams-token.entity';
import { WhatsappChat } from './advisor-whatsapp/entities/whatsapp-chat.entity';
import { WhatsappMessage } from './advisor-whatsapp/entities/whatsapp-message.entity';
import { FaqModule } from './faq/faq.module';
import { Faq } from './faq/entities/faq.entity';
import { TicketsModule } from './tickets/tickets.module';
import { Ticket } from './tickets/ticket.entity';
import { PqrsModule } from './pqrs/pqrs.module';
import { Pqrs } from './pqrs/entities/pqrs.entity';
import { InternalChatModule } from './internal-chat/internal-chat.module';
import { InternalConversation } from './internal-chat/entities/internal-conversation.entity';
import { InternalConversationMember } from './internal-chat/entities/internal-conversation-member.entity';
import { InternalMessage } from './internal-chat/entities/internal-message.entity';
import { PerfilInstitucionalModule } from './perfil-institucional/perfil-institucional.module';
import { PiCategoria } from './perfil-institucional/entities/pi-categoria.entity';
import { PiCampo } from './perfil-institucional/entities/pi-campo.entity';
import { PiValor } from './perfil-institucional/entities/pi-valor.entity';
import { PiHistorial } from './perfil-institucional/entities/pi-historial.entity';
import { SeedModule } from './seed/seed.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<any> => {
        const { createKeyv } = await import('@keyv/redis');
        return {
          stores: [
            createKeyv(
              config.get<string>('REDIS_URL') || 'redis://localhost:6379',
            ),
          ],
          ttl: 10_000,
        } as any;
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().default(5432),
        DB_USER: Joi.string().required(),
        DB_PASS: Joi.string().required(),
        DB_NAME: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required().label('JWT_SECRET'),
        JWT_REFRESH_SECRET: Joi.string()
          .min(32)
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
        REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
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
        timezone: 'UTC',
        extra: {
          max: 40,
          min: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 60000,
          statement_timeout: 60000,
          query_timeout: 60000,
        },
        // Evita que un error puntual del pool (timeout, red, reinicio de DB)
        // tumbe todo el proceso Node con una excepción no capturada.
        poolErrorHandler: (err: Error) => {
          console.error(
            `[DB] Error en pool de conexiones (no fatal): ${err?.message ?? err}`,
          );
        },
        entities: [
          User,
          Session,
          Message,
          Colegio,
          Comunicado,
          ComunicadoEvento,
          ComunicadoTemplate,
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
          Pqrs,
          AuditLog,
          InternalConversation,
          InternalConversationMember,
          InternalMessage,
          PiCategoria,
          PiCampo,
          PiValor,
          PiHistorial,
        ],
        synchronize: config.get<string>('NODE_ENV') === 'development',
        logging: config.get<string>('NODE_ENV') !== 'production',
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
    PqrsModule,
    InternalChatModule,
    PerfilInstitucionalModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: HttpThrottlerGuard,
    },
  ],
})
export class AppModule {}
