import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { Session } from './entities/session.entity';
import { AuthModule } from '../auth/auth.module';
import { User } from 'src/auth/entities/user.entity';
import { Message } from '../chat/entities/message.entity';
import { Colegio } from './entities/colegio.entity';
import { Rating } from './entities/rating.entity';
import { TicketsModule } from '../tickets/tickets.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, User, Message, Colegio, Rating]),
    AuthModule,
    TicketsModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}