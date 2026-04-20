import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDeviceToken(
    userId: number,
    token: string,
    platform: 'android' | 'ios',
  ) {
    const pushToken = await this.prisma.pushToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        isActive: true,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });

    return {
      id: pushToken.id,
      token: pushToken.token,
      platform: pushToken.platform,
      isActive: pushToken.isActive,
      createdAt: pushToken.createdAt,
      updatedAt: pushToken.updatedAt,
      lastUsedAt: pushToken.lastUsedAt,
    };
  }

  async sendToUser(input: {
    senderUserId: number;
    targetUserId: number;
    title: string;
    body: string;
  }) {
    if (input.senderUserId === input.targetUserId) {
      throw new BadRequestException(
        'Voce nao pode enviar notificacao para si mesmo',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, username: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Usuario de destino nao encontrado');
    }

    const activeTokens = await this.prisma.pushToken.findMany({
      where: {
        userId: input.targetUserId,
        isActive: true,
      },
      select: {
        id: true,
        token: true,
      },
    });

    if (activeTokens.length === 0) {
      return {
        success: false,
        message: 'Usuario de destino nao possui token registrado',
        sentCount: 0,
      };
    }

    const messages = activeTokens.map((pushToken) => ({
      to: pushToken.token,
      sound: 'default',
      title: input.title,
      body: input.body,
      data: {
        type: 'manual_notification',
        senderUserId: input.senderUserId,
        targetUserId: input.targetUserId,
      },
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = (await response.json()) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
      errors?: Array<{ message?: string }>;
    };

    const invalidTokens = new Set<string>();

    result.data?.forEach((item, index) => {
      if (item.status !== 'error') {
        return;
      }

      const errorCode = item.details?.error;
      if (
        errorCode === 'DeviceNotRegistered' ||
        errorCode === 'MismatchSenderId'
      ) {
        const token = activeTokens[index]?.token;
        if (token) {
          invalidTokens.add(token);
        }
      }
    });

    if (invalidTokens.size > 0) {
      await this.prisma.pushToken.updateMany({
        where: {
          token: {
            in: Array.from(invalidTokens),
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    return {
      success: response.ok,
      message: response.ok
        ? 'Envio para Expo Push API concluido'
        : 'Expo Push API respondeu com erro',
      sentCount: messages.length,
      invalidatedTokenCount: invalidTokens.size,
      expoResult: result,
    };
  }
}
