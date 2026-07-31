import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { InternalConversation } from './entities/internal-conversation.entity';
import { InternalConversationMember } from './entities/internal-conversation-member.entity';
import { InternalMessage } from './entities/internal-message.entity';
import { InternalChatService } from './internal-chat.service';
import { InternalChatGateway } from './internal-chat.gateway';
import { InternalChatController } from './internal-chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InternalConversation,
      InternalConversationMember,
      InternalMessage,
      User,
    ]),
    AuthModule,
  ],
  controllers: [InternalChatController],
  providers: [InternalChatService, InternalChatGateway],
  exports: [InternalChatService],
})
export class InternalChatModule {}
