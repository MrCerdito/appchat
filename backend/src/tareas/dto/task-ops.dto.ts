import {
  IsString,
  Length,
  MaxLength,
  IsUUID,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class AddTaskCommentDto {
  @IsString()
  @Length(1, 5000)
  contenido: string;
}

export class AddTaskTimeDto {
  /** Minutos. Se limita a 24h por entrada para descartar cargas accidentales. */
  @IsInt()
  @Min(1)
  @Max(1440)
  minutos: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  nota?: string;
}

export class DeleteTaskTimeDto {
  @IsUUID()
  entryId: string;
}

export class SetTaskAssigneesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  userIds: string[];
}

/**
 * Reordenamiento de una columna del kanban.
 *
 * Solo se reordena entre hermanos. Si `parentTaskId` viene informado, la lista
 * debe ser exactamente el conjunto de hijas directas de ese padre, y solo
 * dentro de su mismo `status`: mover una tarea entre columnas es un cambio de
 * estado y pasa por `PATCH /tareas/:id`.
 */
export class ReorderTareasDto {
  @IsString()
  @IsIn(['pendiente', 'en_progreso', 'bloqueada', 'revision', 'completada', 'cancelada'])
  status: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(0)
  @ArrayMaxSize(500)
  orden: string[];

  @IsUUID()
  @IsOptional()
  parentTaskId?: string;
}