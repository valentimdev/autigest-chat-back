import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getConversationMessages(
    userId: number,
    conversationId: number,
    take: number,
  ) {
    await this.ensureConversationAccess(userId, conversationId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return messages.reverse().map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: {
        userId: message.sender.id,
        username: message.sender.username,
      },
    }));
  }

  async ensureUserIsConversationParticipant(
    userId: number,
    conversationId: number,
  ) {
    await this.ensureConversationAccess(userId, conversationId);
  }

  async createMessage(userId: number, conversationId: number, content: string) {
    await this.ensureConversationAccess(userId, conversationId);

    const message = await this.prisma.$transaction(async (prisma) => {
      const createdMessage = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date(),
        },
      });

      return createdMessage;
    });

    return {
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: {
        userId: message.sender.id,
        username: message.sender.username,
      },
    };
  }

  async markMessageAsRead(
    userId: number,
    conversationId: number,
    messageId: number,
  ) {
    await this.ensureConversationAccess(userId, conversationId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
      },
    });

    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const messageRead = await this.prisma.messageRead.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {
        readAt: new Date(),
      },
      create: {
        messageId,
        userId,
      },
    });

    return {
      conversationId,
      messageId,
      userId,
      readAt: messageRead.readAt,
    };
  }

  async listConversations(userId: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      type: conversation.type,
      participants: conversation.participants.map((participant) => ({
        userId: participant.user.id,
        username: participant.user.username,
      })),
      lastMessage: conversation.messages[0] ?? null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  }

  async createOrGetDirectConversation(userId: number, targetUsername: string) {
    const normalizedUsername = targetUsername.trim();

    const targetUser = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true, username: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (userId === targetUser.id) {
      throw new BadRequestException(
        'You cannot create a direct conversation with yourself',
      );
    }

    const directKey = this.buildDirectKey(userId, targetUser.id);

    const conversation = await this.prisma.conversation.upsert({
      where: { directKey },
      update: {},
      create: {
        type: 'DIRECT',
        directKey,
        participants: {
          create: [{ userId }, { userId: targetUser.id }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    return {
      id: conversation.id,
      type: conversation.type,
      participants: conversation.participants.map((participant) => ({
        userId: participant.user.id,
        username: participant.user.username,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private buildDirectKey(firstUserId: number, secondUserId: number) {
    const [smallerId, largerId] = [firstUserId, secondUserId].sort(
      (left, right) => left - right,
    );

    return `${smallerId}:${largerId}`;
  }

  private async ensureConversationAccess(userId: number, conversationId: number) {
    const conversationParticipant =
      await this.prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

    if (!conversationParticipant) {
      throw new NotFoundException('Conversation not found');
    }
  }
}
