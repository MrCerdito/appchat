import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatMediaController } from './chat-media.controller';
import { ChatEventsController } from './chat-events.controller';
import { Message } from './entities/message.entity';
import { SessionEvento } from './entities/session-evento.entity';
import { AiModule } from '../ai/ai.module'; // ← línea nueva
import { SessionsModule } from '../sessions/sessions.module'; // ← línea nueva
import { ConfiguracionModule } from 'src/configuracion/configuracion.module';
import { AdvisorsWhatsappModule } from '../advisor-whatsapp/advisors-whatsapp.module';
import { RedisStateService } from '../common/redis/redis-state.service';
import { FaqModule } from '../faq/faq.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, SessionEvento]),
    JwtModule,
    forwardRef(() => AiModule), // ← línea nueva
    forwardRef(() => SessionsModule), // ← línea nueva
    ConfiguracionModule,
    AdvisorsWhatsappModule,
    FaqModule,
  ],
  controllers: [ChatMediaController, ChatEventsController],
  providers: [ChatService, ChatGateway, RedisStateService],
  exports: [ChatService, ChatGateway, RedisStateService],
})
export class ChatModule {}
