import { IsString, IsOptional, IsArray } from 'class-validator';

export class AiChatDto {
  @IsString()
  message: string;

  @IsArray()
  @IsOptional()
  history?: { role: 'user' | 'model'; text: string }[];

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsString()
  @IsOptional()
  colegio?: string;

  @IsString()
  @IsOptional()
  tipoSolicitud?: string;

  @IsString()
  @IsOptional()
  rol?: string; // ← nuevo campo
}