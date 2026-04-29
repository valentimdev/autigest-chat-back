import { IsString, MinLength } from 'class-validator';

export class CreateDirectConversationDto {
  @IsString()
  @MinLength(1)
  targetUsername: string;
}
