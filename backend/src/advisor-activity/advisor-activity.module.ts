import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvisorActivityLog } from './entities/advisor-activity.entity';
import { AdvisorActivityService } from './advisor-activity.service';
import { User } from '../auth/entities/user.entity';
import { RedisStateService } from '../common/redis/redis-state.service';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdvisorActivityLog, User]),
    ConfiguracionModule,
  ],
  providers: [AdvisorActivityService, RedisStateService],
  exports: [AdvisorActivityService],
})
export class AdvisorActivityModule {}