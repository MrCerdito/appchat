import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Filtros de `GET /metrics/dashboard`.
 *  - marca: 'all' (default) | 'Sian365' | 'ControlAcademic'
 *  - desde/hasta: YYYY-MM-DD (día Bogotá, ambos inclusivos)
 *  - asesorId: filtro opcional por asesor (uuid)
 */
export class MetricsDashboardQueryDto {
  @IsOptional()
  @IsIn(['all', 'Sian365', 'ControlAcademic'])
  marca?: 'all' | 'Sian365' | 'ControlAcademic';

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  asesorId?: string;
}
