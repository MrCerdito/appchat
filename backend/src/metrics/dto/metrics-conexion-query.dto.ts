import { IsDateString, IsOptional } from 'class-validator';
import { MetricsDashboardQueryDto } from './metrics-dashboard-query.dto';

/**
 * Filtros de los endpoints de seguimiento de conexiones:
 *  - `GET /metrics/conexiones/dia` → `fecha` obligatoria (YYYY-MM-DD, día
 *    Bogotá) y `asesorId` opcional. Mismo rango de filtros base que el
 *    dashboard (proyecto/asesorId).
 *  - `GET /metrics/conexiones/historial` → `asesorId` obligatorio (lo valida
 *    el service) y `desde`/`hasta` del rango a auditar.
 */
export class MetricsConexionQueryDto extends MetricsDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
