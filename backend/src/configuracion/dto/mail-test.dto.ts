import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class MailTestDto {
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
}
