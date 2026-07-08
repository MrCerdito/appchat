import { Type } from 'class-transformer';
import {
  IsString, IsOptional, IsInt, IsArray,
  Min, Max, MaxLength, ValidateNested,
} from 'class-validator';
import { HorarioAlmuerzo } from '../entities/configuracion.entity';

class HorarioAlmuerzoObject {
  @IsInt() @Min(0) @Max(6)
  dia: number;

  @IsString()
  inicio: string;

  @IsString()
  fin: string;
}

export class GuardarConfigAdvisorDto {
  @IsOptional() @IsString() @MaxLength(500)
  mensajeBienvenida?: string;

  @IsOptional() @IsInt() @Min(10) @Max(3600)
  asesorInactividadSeg?: number;

  @IsOptional() @IsString() @MaxLength(500)
  asesorInactividadMsg?: string;

  @IsOptional() @IsInt() @Min(10) @Max(3600)
  clienteInactividadSeg?: number;

  @IsOptional() @IsString() @MaxLength(500)
  clienteInactividadMsg?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10)
  clienteInactividadIters?: number;

  @IsOptional() @IsString() @MaxLength(500)
  clienteCierreMsg?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => HorarioAlmuerzoObject)
  almuerzos?: HorarioAlmuerzo[];
}
