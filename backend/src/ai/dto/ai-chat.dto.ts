import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class AiChatDto {
  @IsString()
  @MaxLength(2000)
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

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @IsOptional()
  welcome?: string;
}

export class AiImproveDto {
  @IsString()
  @MaxLength(1000)
  text: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  tone?: string;
}
