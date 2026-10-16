// src/advisors-whatsapp/advisors-whatsapp.module.ts
// Prácticamente independiente del resto del backend: solo necesita que
// ConfigModule esté registrado globalmente en app.module.ts.
//
// La única excepción es CalendarioModule: de ahí se inyecta
// CalendarioGrupoService como @Optional() únicamente para invalidar su caché
// después de crear una reunión (si no, tarda hasta 5 minutos en aparecer en
// el calendario y en Métricas).

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { User } from '../auth/entities/user.entity';
import { CalendarioModule } from '../calendario/calendario.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { TicketsModule } from '../tickets/tickets.module';
import { RedisStateService } from '../common/redis/redis-state.service';
import { AdvisorsWhatsappController } from './advisors-whatsapp.controller';
import { AdvisorsWhatsappService } from './advisors-whatsapp.service';
import { AdvisorsWhatsappGateway } from './advisors-whatsapp.gateway';
import { TeamsMeetingsService } from './teams-meetings.service';
import { TeamsToken } from './entities/teams-token.entity';
import { TeamsMeeting } from './entities/teams-meeting.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { Colegio } from '../sessions/entities/colegio.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappChat,
      WhatsappMessage,
      TeamsToken,
      TeamsMeeting,
      User,
      Colegio,
    ]),
    AuthModule,
    CalendarioModule,
    ConfiguracionModule,
    forwardRef(() => TicketsModule),
  ],
  controllers: [AdvisorsWhatsappController],
  providers: [
    AdvisorsWhatsappService,
    AdvisorsWhatsappGateway,
    TeamsMeetingsService,
    RedisStateService,
    RolesGuard,
  ],
  exports: [AdvisorsWhatsappService, AdvisorsWhatsappGateway],
})
export class AdvisorsWhatsappModule {}
