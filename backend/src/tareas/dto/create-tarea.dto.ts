import {
  IsString,
  IsOptional,
  IsIn,
  Length,
  MaxLength,
  IsUUID,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { TAREA_STATUSES, TAREA_PRIORIDADES } from '../tarea.entity';

export class CreateTareaDto {
  @IsString()
  @Length(1, 255)
  titulo: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  descripcion?: string;

  @IsString()
  @IsOptional()
  @IsIn(TAREA_STATUSES as unknown as string[])
  status?: string;

  @IsString()
  @IsOptional()
  @IsIn(TAREA_PRIORIDADES as unknown as string[])
  prioridad?: string;

  /** Ticket al que pertenece la tarea. Opcional: admite tareas internas. */
  @IsUUID()
  @IsOptional()
  ticketId?: string;

  /**
   * Padre de la subtarea. El anidamiento es arbitrario: una subtarea puede
   * tener a su vez daughters. El servicio valida que el padre exista y sea
   * visible para quien crea.
   */
  @IsUUID()
  @IsOptional()
  parentTaskId?: string;

  @IsUUID()
  @IsOptional()
  moduloId?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(50)
  @IsOptional()
  asignados?: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  tags?: string[];

  /** ISO 8601. Se normaliza a timestamptz en el servicio. */
  @IsString()
  @IsOptional()
  dueDate?: string;
}