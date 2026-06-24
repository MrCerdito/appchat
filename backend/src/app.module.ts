import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { WidgetConfigModule } from './widget/widget-config.module';
import { WidgetConfig } from './widget/entities/widget-config.entity';
import { AiLog } from './ai/entitites/ai-log.entity';
import { AdvisorsWhatsappModule } from './advisor-whatsapp/advisors-whatsapp.module';
import { TeamsToken } from './advisor-whatsapp/entities/teams-token.entity';
import { WhatsappChat } from './advisor-whatsapp/entities/whatsapp-chat.entity';
import { WhatsappMessage } from './advisor-whatsapp/entities/whatsapp-message.entity';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
        ],
        synchronize: false,
        logging: false,
      }),
    }),
    AuthModule,
    SessionsModule,
    ChatModule,
    ComunicadosModule,
    TrackModule,
    AiModule,
    DocumentosModule,
    ConfiguracionModule,
    WidgetConfigModule,
    AdvisorsWhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
