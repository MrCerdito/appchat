import { IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class AddNoteDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images: string[] = [];
}
