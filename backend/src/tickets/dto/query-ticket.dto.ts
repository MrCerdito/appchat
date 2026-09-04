import { IsOptional, IsString } from 'class-validator';

export class QueryTicketDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  sourceType?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;
}
