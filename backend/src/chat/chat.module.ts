import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { Message } from './entities/message.entity';
import { AiModule } from '../ai/ai.module';           // ← línea nueva
import { SessionsModule } from '../sessions/sessions.module'; // ← línea nueva
import { ConfiguracionModule } from 'src/configuracion/configuracion.module';
import { AdvisorsWhatsappModule } from '../advisor-whatsapp/advisors-whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message]),
    JwtModule,
    AiModule,       // ← línea nueva
    forwardRef(() => SessionsModule), // ← línea nueva
    ConfiguracionModule, 
    AdvisorsWhatsappModule,
  ],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
