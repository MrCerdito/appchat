import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketsGateway } from './tickets.gateway';
import { TicketMailService } from './ticket-mail.service';
import { Ticket } from './ticket.entity';
import { TicketAudit } from './entities/ticket-audit.entity';
import { TicketAuditService } from './ticket-audit.service';
import { User } from '../auth/entities/user.entity';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlaModule } from '../slaprotection/sla.module';
import { AccesosModule } from '../accesos/accesos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketAudit, User]),
    JwtModule.register({}),
    ConfigModule,
    ConfiguracionModule,
    NotificationsModule,
    SlaModule,
    AccesosModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsGateway, TicketMailService, TicketAuditService],
  exports: [TicketsService],
})
export class TicketsModule {}
