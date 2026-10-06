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

/**
 * Actualizacion parcial de una tarea.
 *
 * `parentTaskId` NO aparece a proposito. El unico modo de colgar una subtarea
 * es crearla ya con su padre (`CreateTareaDto.parentTaskId`), asi que la
 * jerarquia es inmutable en la practica y un ciclo es imposible por
 * construccion. Admitir el reparentado exigiria validar que el nuevo padre no
 * este dentro del subarbol de la tarea, que es una consulta recursiva extra en
 * cada guardado. Queda fuera de esta version.
 *
 * Los campos anulables aceptan `null` explicito para desasignar:
 * `ticketId`, `moduloId` y `dueDate`. Omitirlos no los toca.
 */
export class UpdateTareaDto {
  @IsString()
  @IsOptional()
  @Length(1, 255)
  titulo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  descripcion?: string | null;

  @IsString()
  @IsOptional()
  @IsIn(TAREA_STATUSES as unknown as string[])
  status?: string;

  @IsString()
  @IsOptional()
  @IsIn(TAREA_PRIORIDADES as unknown as string[])
  prioridad?: string;

  @IsUUID()
  @IsOptional()
  ticketId?: string | null;

  @IsUUID()
  @IsOptional()
  moduloId?: string | null;

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

  /** Acepta `null` para quitar la fecha de vencimiento. */
  @IsString()
  @IsOptional()
  dueDate?: string | null;

  /** Permite limpiar el antirrebote cuando el usuario reprograma la tarea. */
  @IsString()
  @IsOptional()
  resetReminder?: 'true' | 'false';
}