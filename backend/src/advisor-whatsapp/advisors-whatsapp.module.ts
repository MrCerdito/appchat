// src/advisors-whatsapp/advisors-whatsapp.module.ts
// Módulo independiente del resto del backend.
// Solo requiere que ConfigModule esté registrado globalmente en app.module.ts.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AdvisorsWhatsappController } from './advisors-whatsapp.controller';
import { AdvisorsWhatsappService } from './advisors-whatsapp.service';
import { AdvisorsWhatsappGateway } from './advisors-whatsapp.gateway';
import { TeamsMeetingsService } from './teams-meetings.service';
import { TeamsToken } from './entities/teams-token.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappChat, WhatsappMessage, TeamsToken, User]),
    AuthModule,
    ConfiguracionModule,
    TicketsModule,
  ],
  controllers: [AdvisorsWhatsappController],
  providers: [
    AdvisorsWhatsappService,
    AdvisorsWhatsappGateway,
    TeamsMeetingsService,
  ],
  exports: [AdvisorsWhatsappService],
})
export class AdvisorsWhatsappModule {}
