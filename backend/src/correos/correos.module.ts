import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../auth/entities/user.entity';
import { CorreosController } from './correos.controller';
import { CorreosAdminController } from './correos-admin.controller';
import { CorreosInlineController } from './correos-inline.controller';
import { CorreosService } from './correos.service';
import { CorreosAdminService } from './correos-admin.service';
import { CorreosCarpetaService } from './correos-carpeta.service';
import { CorreosSyncService } from './correos-sync.service';
import { MicrosoftGraphMailService } from './microsoft-graph-mail.service';
import { CorreosGateway } from './correos.gateway';
import { CorreoMensaje } from './entities/correo-mensaje.entity';
import { CorreoAdjunto } from './entities/correo-adjunto.entity';
import { CorreoCarpetaSync } from './entities/correo-carpeta-sync.entity';

/**
 * Modulo de correo del buzon compartido.
 *
 * No depende de Outlook ni de IMAP: todo va contra Microsoft Graph con la
 * identidad de la propia app (client_credentials), asi que corre desatendido sin
 * que ningun asesor inicie sesion. ConfigModule es global en app.module.ts.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CorreoMensaje, CorreoAdjunto, CorreoCarpetaSync, User]),
    AuthModule,
    // El gateway verifica el JWT del socket; NotificationsModule es el que
    // guarda y empuja los avisos de correo nuevo a la campana.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    NotificationsModule,
  ],
  controllers: [CorreosController, CorreosAdminController, CorreosInlineController],
  providers: [
    CorreosService,
    // Solo de lectura y de consulta para el admin; no se exporta porque nadie
    // mas lo necesita.
    CorreosAdminService,
    CorreosSyncService,
    CorreosCarpetaService,
    MicrosoftGraphMailService,
    CorreosGateway,
  ],
  exports: [CorreosService, CorreosSyncService, CorreosCarpetaService, MicrosoftGraphMailService, CorreosGateway],
})
export class CorreosModule {}
