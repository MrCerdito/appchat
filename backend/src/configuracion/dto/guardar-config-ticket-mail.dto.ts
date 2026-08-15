import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class GuardarConfigTicketMailDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ticketEmailActivo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ticketEmailAsunto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  ticketEmailCuerpo?: string;

  @IsOptional()
  @IsArray()
  ticketEmailDesign?: unknown[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ticketEmailSenderName?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ticketEmailIncludeInfo?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ticketEmailSendCopy?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ticketEmailAttachments?: boolean;
}
