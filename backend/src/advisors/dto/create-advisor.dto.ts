import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class CreateAdvisorDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  name!: string;

  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener mínimo 8 caracteres' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/,
    {
      message:
        'La contraseña debe contener mayúscula, minúscula, número y carácter especial',
    },
  )
  password!: string;
}
