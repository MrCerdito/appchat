import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Filtros de `GET /metrics/dashboard`.
 *  - proyecto: 'all' (default) | 'Sian365' | 'ControlAcademic'
 *  - desde/hasta: YYYY-MM-DD (día Bogotá, ambos inclusivos)
 *  - asesorId: filtro opcional por asesor (uuid)
 *  - tablaPagina: página de la tabla de reuniones (1 por defecto). El
 *    tamaño de página lo define el backend y se devuelve en `reuniones.tablaPaginas`.
 */
export class MetricsDashboardQueryDto {
  @IsOptional()
  @IsIn(['all', 'Sian365', 'ControlAcademic'])
  proyecto?: 'all' | 'Sian365' | 'ControlAcademic';

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  tablaPagina?: number;
}
