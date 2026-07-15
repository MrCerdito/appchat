import { IsString, IsOptional, IsIn, Length } from 'class-validator';

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  @Length(1, 255)
  titulo?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status?: string;

  @IsString()
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  category?: string;

  @IsString()
  @IsOptional()
  assignedToId?: string;
}
