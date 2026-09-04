import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsEmail,
  Length,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  titulo: string;

  @IsString()
  @IsOptional()
  @Length(1, 5000)
  descripcion?: string | null;

  @IsString()
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  category?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['web', 'whatsapp', 'internal', 'email'])
  sourceType: string;

  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  clientName: string;

  @IsOptional()
  clientInfo?: Record<string, any>;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  assignedToId?: string;

  @IsString()
  @IsOptional()
  @Length(1, 255)
  institucion?: string;

  @IsString()
  @IsOptional()
  @IsIn(['web', 'whatsapp', 'internal', 'email'])
  canal?: string;

  @IsOptional()
  conversation?: any[];
}
