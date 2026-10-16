// src/calendario/calendario.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { CorreosModule } from '../correos/correos.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamsMeeting } from '../advisor-whatsapp/entities/teams-meeting.entity';
import { CalendarioController } from './calendario.controller';
import { CalendarioGrupoService } from './calendario-grupo.service';
import { CalendarWarmService } from './calendar-warm.service';
import { CumpleanosNotificationsService } from './cumpleanos-notifications.service';
import { MeetingReminderService } from './meeting-reminder.service';

/**
 * Lectura del calendario compartido (grupo M365 + buzon compartido).
 *
 * Importa `CorreosModule` unicamente por `MicrosoftGraphMailService`, que ya
 * resuelve el token de aplicacion, lo cachea y reintenta 429/5xx. No se crea un
 * segundo cliente de Graph: la creacion de reuniones sigue siendo de
 * `TeamsMeetingsService`, aqui solo se leen. Ese servicio es el unico que
 * consume esta cache, via `CalendarioGrupoService.invalidar()`.
 *
 * `TeamsMeeting` se registra solo para leer (TypeOrmModule.forFeature) y poder
 * marcar en la UI los eventos que se crearon desde la app.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TeamsMeeting, User]),
    AuthModule,
    CorreosModule,
    NotificationsModule,
  ],
  controllers: [CalendarioController],
  providers: [
    CalendarioGrupoService,
    CalendarWarmService,
    CumpleanosNotificationsService,
    MeetingReminderService,
  ],
  // CalendarioGrupoService es un singleton: Metricas importa este modulo para
  // reusar la MISMA instancia (y por tanto la misma cache en memoria y el mismo
  // cliente de Graph) en vez de abrir un segundo viaje a Microsoft.
  exports: [CalendarioGrupoService, CalendarWarmService],
})
export class CalendarioModule {}
