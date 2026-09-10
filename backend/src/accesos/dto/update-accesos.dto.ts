import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ModuloAccesoItemDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsBoolean()
  activo: boolean;
}

export class UpdateAccesosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuloAccesoItemDto)
  modulos: ModuloAccesoItemDto[];
}