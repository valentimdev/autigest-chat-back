import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResultDto } from './dto/auth-result.dto';
import { SignInData } from './types/sign-in-data.type';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
  ) {}

  async authenticate(input: LoginDto): Promise<AuthResultDto> {
    const user = await this.validateUser(input);

    if (!user) {
      throw new UnauthorizedException();
    }

    return this.signIn(user);
  }

  async register(input: RegisterDto): Promise<AuthResultDto> {
    const hashedPassword = await bcrypt.hash(
      input.password,
      PASSWORD_SALT_ROUNDS,
    );
    const user = await this.userService.createUser({
      ...input,
      password: hashedPassword,
    });

    return this.signIn({
      userId: user.userId,
      username: user.username,
    });
  }

  async validateUser(input: LoginDto): Promise<SignInData | null> {
    const user = await this.userService.findUserByName(input.username);

    if (user && (await bcrypt.compare(input.password, user.password))) {
      return {
        userId: user.userId,
        username: user.username,
      };
    }
    return null;
  }

  async signIn(user: SignInData): Promise<AuthResultDto> {
    const tokenPayload = {
      sub: user.userId,
      username: user.username,
    };

    const accessToken = await this.jwtService.signAsync(tokenPayload);

    return { accessToken, username: user.username, userId: user.userId };
  }
}
