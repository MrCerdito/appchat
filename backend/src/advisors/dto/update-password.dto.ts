import { IsString, MinLength, Matches } from 'class-validator';

export class UpdatePasswordDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener mínimo 8 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/, {
    message: 'La contraseña debe contener mayúscula, minúscula, número y carácter especial',
  })
  password!: string;
}
