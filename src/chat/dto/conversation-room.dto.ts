import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class ConversationRoomDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  conversationId: number;
}
