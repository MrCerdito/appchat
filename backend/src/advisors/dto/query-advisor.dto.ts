import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAdvisorDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['admin', 'advisor', 'desarrollador', 'todos'], { message: 'Rol inválido' })
  role?: 'admin' | 'advisor' | 'desarrollador' | 'todos';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
