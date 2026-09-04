import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlaService } from './sla.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, Configuracion]),
    NotificationsModule,
  ],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
