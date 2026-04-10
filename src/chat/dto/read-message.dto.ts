import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class ReadMessageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  conversationId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  messageId: number;
}
