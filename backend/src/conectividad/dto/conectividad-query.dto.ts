import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Filtros comunes del módulo de conectividad.
 *  - desde/hasta: YYYY-MM-DD (día Bogotá, inclusivos). Default: últimos 30 días.
 *  - asesorId: filtro opcional por asesor (uuid).
 *  - proyecto: se acepta por compatibilidad con los filtros de Métricas, pero
 *    `advisor_activity_log` no tiene relación con colegios, así que no filtra.
 */
export class ConectividadQueryDto {
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
  @IsIn(['all', 'Sian365', 'ControlAcademic'])
  proyecto?: 'all' | 'Sian365' | 'ControlAcademic';
}

/** `GET /conectividad/mapa-calor`: métrica de intensidad de la celda. */
export class ConectividadMapaQueryDto extends ConectividadQueryDto {
  @IsOptional()
  @IsIn(['desconexiones', 'minutos', 'afectados', 'disponibilidad'])
  metrica?: 'desconexiones' | 'minutos' | 'afectados' | 'disponibilidad';
}

/** `GET /conectividad/eventos`: historial paginado con filtros. */
export class ConectividadEventosQueryDto extends ConectividadQueryDto {
  @IsOptional()
  @IsIn([
    'conexion',
    'desconexion',
    'status',
    'almuerzo_inicio',
    'almuerzo_fin',
  ])
  tipo?: string;

  @IsOptional()
  @IsIn(['connect', 'disconnect', 'manual', 'almuerzo', 'timeout', 'sistema'])
  causa?: string;

  @IsOptional()
  @IsIn(['online', 'busy', 'meeting', 'almuerzo', 'offline'])
  estado?: string;

  /** Duración mínima del intervalo, en minutos. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durMin?: number;

  /** Duración máxima del intervalo, en minutos. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  orden?: 'asc' | 'desc';
}

/** `GET /conectividad/incidentes`: listado con revisión y paginación. */
export class ConectividadIncidentesQueryDto extends ConectividadQueryDto {
  @IsOptional()
  @IsIn(['nuevo', 'en_revision', 'resuelto', 'descartado'])
  estado?: 'nuevo' | 'en_revision' | 'resuelto' | 'descartado';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** `PATCH /conectividad/incidentes/:clave`. */
export class ConectividadRevisionDto {
  @IsIn(['nuevo', 'en_revision', 'resuelto', 'descartado'])
  estado!: 'nuevo' | 'en_revision' | 'resuelto' | 'descartado';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentario?: string;
}
