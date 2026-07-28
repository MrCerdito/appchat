import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsEmail,
  Length,
} from 'class-validator';

export class CreatePqrsDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['peticion', 'queja', 'reclamo', 'sugerencia'])
  tipo: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  asunto: string;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsString()
  @IsOptional()
  identificacion?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  nombre: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  apellido?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  @Length(1, 150)
  colegio?: string;

  @IsOptional()
  adjuntos?: any[];
}
