import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketMailService } from './ticket-mail.service';
import { Ticket } from './ticket.entity';
import { User } from '../auth/entities/user.entity';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, User]),
    ConfiguracionModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketMailService],
  exports: [TicketsService],
})
export class TicketsModule {}
