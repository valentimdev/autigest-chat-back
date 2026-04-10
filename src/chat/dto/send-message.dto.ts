import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  conversationId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
