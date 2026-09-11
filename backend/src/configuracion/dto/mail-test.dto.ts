import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class MailTestCredencialDto {
  @IsString()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(255)
  usuario: string;

  @IsString()
  @MaxLength(500)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  servidorsmtp?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  seguridadssl?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  protocolo_Tls12?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  azure_TenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  azure_ClientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  azure_ClientSecret?: string;
}

export class MailTestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MailTestCredencialDto)
  credencial?: MailTestCredencialDto;

  @IsString()
  @MaxLength(255)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  cuerpo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  asunto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mailFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;
}
