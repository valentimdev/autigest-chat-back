import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SendPushToUserDto {
  @IsInt()
  @Min(1)
  targetUserId: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
