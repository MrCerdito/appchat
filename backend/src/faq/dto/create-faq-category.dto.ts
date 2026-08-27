import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateFaqCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  activo?: boolean;
}
