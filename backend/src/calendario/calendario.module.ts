// src/calendario/calendario.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CorreosModule } from '../correos/correos.module';
import { TeamsMeeting } from '../advisor-whatsapp/entities/teams-meeting.entity';
import { CalendarioController } from './calendario.controller';
import { CalendarioGrupoService } from './calendario-grupo.service';

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
    TypeOrmModule.forFeature([TeamsMeeting]),
    AuthModule,
    CorreosModule,
  ],
  controllers: [CalendarioController],
  providers: [CalendarioGrupoService],
  exports: [CalendarioGrupoService],
})
export class CalendarioModule {}