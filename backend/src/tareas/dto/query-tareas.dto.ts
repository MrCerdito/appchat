import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsArray,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { TAREA_STATUSES, TAREA_PRIORIDADES } from '../tarea.entity';

/**
 * Normaliza query params de listas a array. Acepta las dos convenciones que
 * usa el front: `?status=a&status=b` y `?status=a,b`.
 */
const toArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const toBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === '1' || value === 1;
};

export class QueryTareasDto {
  @Transform(toArray)
  @IsArray()
  @IsIn(TAREA_STATUSES as unknown as string[], { each: true })
  @IsOptional()
  status?: string[];

  @Transform(toArray)
  @IsArray()
  @IsIn(TAREA_PRIORIDADES as unknown as string[], { each: true })
  @IsOptional()
  prioridad?: string[];

  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  ticketId?: string;

  @IsString()
  @IsOptional()
  moduloId?: string;

  /** Filtra por responsable. El admin puede usarlo para auditar a alguien. */
  @IsString()
  @IsOptional()
  asignadoA?: string;

  @IsString()
  @IsOptional()
  creadoPor?: string;

  /** Busqueda libre sobre titulo y descripcion. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  q?: string;

  /** Solo tareas que no cuelgan de un ticket (trabajo interno puro). */
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  soloSinTicket?: boolean;

  /**
   * Solo tareas raiz. El kanban lo usa siempre: los subarboles se trabajan
   * dentro del detalle, no como columnas propias del tablero.
   */
  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  soloRaiz?: boolean;

  @IsString()
  @IsOptional()
  @IsIn(['panel', 'kanban', 'lista', 'arbol'])
  vista?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;
}
