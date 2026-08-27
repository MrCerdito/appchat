import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PI_TIPOS_CAMPO = [
  'texto',
  'texto_largo',
  'numero',
  'fecha',
  'booleano',
  'lista',
  'email',
  'email_lista',
  'telefono',
  'url',
  'archivo',
  'moneda',
  'porcentaje',
] as const;

export class PiOpcionDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 150)
  valor: string;

  @IsOptional()
  @IsInt()
  orden?: number;
}

export class CreatePiCampoDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 150)
  nombre: string;

  @IsUUID()
  categoriaId: string;

  @IsIn(PI_TIPOS_CAMPO)
  tipo: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PiOpcionDto)
  opciones?: PiOpcionDto[];

  @IsOptional()
  @IsBoolean()
  requerido?: boolean;

  @IsOptional()
  @IsBoolean()
  mostrarListado?: boolean;

  @IsOptional()
  @IsBoolean()
  mostrarPerfil?: boolean;

  @IsOptional()
  @IsBoolean()
  buscar?: boolean;

  @IsOptional()
  @IsBoolean()
  filtrable?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  orden?: number;
}

export class UpdatePiCampoDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  nombre?: string;

  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @IsIn(PI_TIPOS_CAMPO)
  tipo?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PiOpcionDto)
  opciones?: PiOpcionDto[];

  @IsOptional()
  @IsBoolean()
  requerido?: boolean;

  @IsOptional()
  @IsBoolean()
  mostrarListado?: boolean;

  @IsOptional()
  @IsBoolean()
  mostrarPerfil?: boolean;

  @IsOptional()
  @IsBoolean()
  buscar?: boolean;

  @IsOptional()
  @IsBoolean()
  filtrable?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  orden?: number;
}

export class CreatePiCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  nombre: string;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class UpdatePiCategoriaDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  nombre?: string;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class PiValorItemDto {
  @IsUUID()
  campoId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  valor?: string | null;
}

export class UpsertPiValoresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PiValorItemDto)
  valores: PiValorItemDto[];
}

export class ReorderItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  orden: number;
}

export class ReorderCategoriasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

export class ActualizarBaseInstitucionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  link?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  calendario?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tipoColegio?: string | null;

  @IsOptional()
  @IsUUID()
  advisorId?: string | null;
}
