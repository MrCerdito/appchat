import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateFaqDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  pregunta: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  respuesta: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  categoria?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsInt()
  colegioId?: number;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  activo?: boolean;
}
