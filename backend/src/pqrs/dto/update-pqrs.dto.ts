import {
  IsString,
  IsOptional,
  IsIn,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdatePqrsDto {
  @IsString()
  @IsOptional()
  @IsIn(['pending', 'in_review', 'resolved', 'closed'])
  status?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  respuesta?: string;
}
