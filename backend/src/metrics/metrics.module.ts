import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Módulo de métricas del dashboard administrativo (Korvix / SIAN365 /
 * ControlAcademic). Solo lectura sobre las entidades de otros módulos a
 * través de `DataSource` (sin dependencias de sus servicios) + export Excel.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
