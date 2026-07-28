import {
  IsString,
  IsOptional,
  IsIn,
  Length,
} from 'class-validator';

export class UpdatePqrsDto {
  @IsString()
  @IsOptional()
  @IsIn(['pending', 'in_review', 'resolved', 'closed'])
  status?: string;

  @IsString()
  @IsOptional()
  respuesta?: string;
}
