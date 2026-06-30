import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvisorsController } from './advisors.controller';
import { AdvisorsService } from './advisors.service';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AdvisorsController],
  providers: [AdvisorsService, RolesGuard],
})
export class AdvisorsModule {}
