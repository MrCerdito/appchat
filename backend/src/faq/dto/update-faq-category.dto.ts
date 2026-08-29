import {
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateFaqCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  activo?: boolean;
}
