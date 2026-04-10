import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserInput } from './types/create-user-input.type';
import { User } from './types/user.type';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByName(username: string): Promise<User | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return undefined;
    }

    return {
      userId: user.id,
      username: user.username,
      password: user.password,
    };
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const existingUser = await this.findUserByName(input.username);

    if (existingUser) {
      throw new ConflictException(`Username ${input.username} already exists`);
    }

    const user = await this.prisma.user.create({
      data: {
        username: input.username,
        password: input.password,
      },
    });

    return {
      userId: user.id,
      username: user.username,
      password: user.password,
    };
  }
}
