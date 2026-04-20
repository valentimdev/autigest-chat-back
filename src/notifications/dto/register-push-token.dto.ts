import { IsIn, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}
