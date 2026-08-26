import { IsString, MinLength } from 'class-validator';

export class FaqChatDto {
  @IsString()
  @MinLength(1)
  query: string;
}
