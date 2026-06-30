import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdvisorDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email?: string;
}
