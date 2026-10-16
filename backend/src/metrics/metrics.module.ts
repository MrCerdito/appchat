import { Module } from '@nestjs/common';
import { CalendarioModule } from '../calendario/calendario.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Módulo de métricas del dashboard administrativo (Korvix / SIAN365 /
 * ControlAcademic). Export Excel incluido.
 *
 * Casi todo se lee desde `DataSource` (entidades de otros módulos, sin sus
 * servicios). La única excepción es Reuniones: el total debe incluir las
 * reuniones creadas directamente en Teams/Outlook, que solo existen en el
 * calendario M365 y NO se copian a `teams_meetings`. Se usa el
 * `CalendarWarmService` del módulo de Calendario, que las sirve desde su caché
 * en memoria sin escribir nada en la base.
 */
@Module({
  imports: [CalendarioModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
