import { Module } from '@nestjs/common';
import { TrackController } from './track.controller';
import { TrackDedupService } from './track-dedup.service';
import { ComunicadosModule } from '../comunicados/comunicados.module';

@Module({
  imports: [ComunicadosModule],
  controllers: [TrackController],
  providers: [TrackDedupService],
})
export class TrackModule {}
