import { IsEmail, IsNotEmpty, IsString, IsBoolean, IsOptional, Matches, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ImportUserDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email es requerido' })
  email: string;

  @IsString({ message: 'Nombre debe ser un texto' })
  @IsNotEmpty({ message: 'Nombre es requerido' })
  @MinLength(2, { message: 'Nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'Nombre no puede exceder 100 caracteres' })
  name: string;

  @IsString({ message: 'Rol debe ser un texto' })
  @IsNotEmpty({ message: 'Rol es requerido' })
  @Matches(/^(admin|advisor|desarrollador)$/, { message: 'Rol inválido' })
  @Transform(({ value }) => value.toLowerCase())
  role: 'admin' | 'advisor' | 'desarrollador';

  @IsBoolean({ message: 'Activo debe ser un valor booleano' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'TRUE' || value === 'true' || value === 1) return true;
    if (value === 'FALSE' || value === 'false' || value === 0) return false;
    return value; // Mantener el valor original para que IsBoolean lo valide
  })
  active?: boolean;

  // La contraseña será generada si no se provee, no se incluye en este DTO para validación directa
  // Se manejará en el servicio.
}
