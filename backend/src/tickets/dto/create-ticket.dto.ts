import { IsString, IsNotEmpty, IsOptional, IsIn, Length } from 'class-validator';

export class CreateTicketDto {
  @IsString() @IsNotEmpty() @Length(1, 255)
  titulo: string;

  @IsString() @IsOptional()
  descripcion?: string | null;

  @IsString() @IsOptional() @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsString() @IsOptional() @Length(1, 100)
  category?: string;

  @IsString() @IsNotEmpty() @IsIn(['web', 'whatsapp'])
  sourceType: string;

  @IsString() @IsNotEmpty()
  sourceId: string;

  @IsString() @IsNotEmpty() @Length(1, 255)
  clientName: string;

  @IsOptional()
  clientInfo?: Record<string, any>;

  @IsString() @IsOptional()
  assignedToId?: string;

  @IsOptional()
  conversation?: any[];
}
