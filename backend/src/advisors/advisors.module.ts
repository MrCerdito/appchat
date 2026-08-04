import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvisorsController } from './advisors.controller';
import { AdvisorsService } from './advisors.service';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { InternalChatModule } from '../internal-chat/internal-chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuthModule,
    forwardRef(() => InternalChatModule),
  ],
  controllers: [AdvisorsController],
  providers: [AdvisorsService, RolesGuard],
  exports: [AdvisorsService],
})
export class AdvisorsModule {}
