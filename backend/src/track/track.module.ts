import { Module } from '@nestjs/common';
import { TrackController } from './track.controller';
import { ComunicadosModule } from '../comunicados/comunicados.module';

@Module({
  imports: [ComunicadosModule],
  controllers: [TrackController],
})
export class TrackModule {}