import { Type } from 'class-transformer';
import {
  IsString, IsOptional, IsBoolean, IsNumber, IsArray,
  Min, Max, MaxLength, ValidateNested, IsInt,
} from 'class-validator';
import { HorarioSlot, HorarioAlmuerzo } from '../entities/configuracion.entity';

export class GuardarConfigGlobalDto {
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
  @Type(() => HorarioSlotObject)
  horarios?: HorarioSlot[];

  @IsOptional() @IsString() @MaxLength(500)
  horarioFueraMsg?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  horariosActivos?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => HorarioAlmuerzoObject)
  almuerzos?: HorarioAlmuerzo[];

  @IsOptional() @IsString() @MaxLength(500)
  whatsappAssignmentMsg?: string;

  @IsOptional() @IsString() @MaxLength(500)
  whatsappQueueMsg?: string;

  @IsOptional() @IsString() @MaxLength(500)
  whatsappOutOfHoursMsg?: string;

  @IsOptional() @IsString() @MaxLength(500)
  whatsappCallUnavailableMsg?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  @MaxLength(500, { each: true })
  whatsappQuickReplies?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  @MaxLength(100, { each: true })
  ticketCategories?: string[];

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  sonidoActivado?: boolean;

  @IsOptional() @IsString() @MaxLength(30)
  sonidoWhatsapp?: string;

  @IsOptional() @IsString() @MaxLength(30)
  sonidoAsesor?: string;

  @IsOptional() @IsString() @MaxLength(30)
  sonidoCliente?: string;

  @IsOptional() @IsString() @MaxLength(30)
  sonidoAsignacion?: string;
}

class HorarioSlotObject {
  @IsInt() @Min(0) @Max(6)
  dia: number;

  @IsString()
  inicio: string;

  @IsString()
  fin: string;
}

class HorarioAlmuerzoObject {
  @IsInt() @Min(0) @Max(6)
  dia: number;

  @IsString()
  inicio: string;

  @IsString()
  fin: string;
}
