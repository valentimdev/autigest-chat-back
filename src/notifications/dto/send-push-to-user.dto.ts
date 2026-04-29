import { IsOptional, IsString, MinLength } from 'class-validator';

export class SendPushToUserDto {
  @IsString()
  @MinLength(1)
  targetUsername: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
