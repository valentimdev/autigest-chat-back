import { IsString, MinLength } from 'class-validator';

export class AuthCredentialsDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
