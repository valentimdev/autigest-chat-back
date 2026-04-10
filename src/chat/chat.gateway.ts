import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatService } from './chat.service';
import { ConversationRoomDto } from './dto/conversation-room.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { SendMessageDto } from './dto/send-message.dto';

type AuthenticatedSocket = Socket & {
  data: {
    user?: {
      userId: number;
      username: string;
    };
  };
};

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(@ConnectedSocket() socket: AuthenticatedSocket) {
    const token = this.extractToken(socket);

    if (!token) {
      socket.disconnect();
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      socket.data.user = {
        userId: payload.sub,
        username: payload.username,
      };
    } catch {
      socket.disconnect();
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private extractToken(socket: AuthenticatedSocket) {
    const authToken = socket.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken;
    }

    const authorizationHeader = socket.handshake.headers.authorization;

    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }

  @SubscribeMessage('conversation.join')
  async handleConversationJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: ConversationRoomDto,
  ) {
    const payload = await this.validateConversationRoomPayload(body);
    const user = this.getAuthenticatedUser(socket);

    await this.chatService.ensureUserIsConversationParticipant(
      user.userId,
      payload.conversationId,
    );

    const room = this.buildConversationRoom(payload.conversationId);
    await socket.join(room);

    return {
      event: 'conversation.joined',
      data: {
        conversationId: payload.conversationId,
      },
    };
  }

  @SubscribeMessage('conversation.leave')
  async handleConversationLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: ConversationRoomDto,
  ) {
    const payload = await this.validateConversationRoomPayload(body);
    const user = this.getAuthenticatedUser(socket);

    await this.chatService.ensureUserIsConversationParticipant(
      user.userId,
      payload.conversationId,
    );

    const room = this.buildConversationRoom(payload.conversationId);
    await socket.leave(room);

    return {
      event: 'conversation.left',
      data: {
        conversationId: payload.conversationId,
      },
    };
  }

  @SubscribeMessage('message.send')
  async handleSendMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: SendMessageDto,
  ) {
    const payload = await this.validatePayload(SendMessageDto, body);
    const user = this.getAuthenticatedUser(socket);

    const message = await this.chatService.createMessage(
      user.userId,
      payload.conversationId,
      payload.content.trim(),
    );

    const room = this.buildConversationRoom(payload.conversationId);
    this.server.to(room).emit('message.created', message);

    return {
      event: 'message.created',
      data: message,
    };
  }

  @SubscribeMessage('message.read')
  async handleReadMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: ReadMessageDto,
  ) {
    const payload = await this.validatePayload(ReadMessageDto, body);
    const user = this.getAuthenticatedUser(socket);

    const readReceipt = await this.chatService.markMessageAsRead(
      user.userId,
      payload.conversationId,
      payload.messageId,
    );

    const room = this.buildConversationRoom(payload.conversationId);
    this.server.to(room).emit('message.read.updated', readReceipt);

    return {
      event: 'message.read.updated',
      data: readReceipt,
    };
  }

  private getAuthenticatedUser(socket: AuthenticatedSocket) {
    const user = socket.data.user;

    if (!user) {
      throw new WsException('Unauthenticated socket');
    }

    return user;
  }

  private async validateConversationRoomPayload(body: ConversationRoomDto) {
    return this.validatePayload(ConversationRoomDto, body);
  }

  private async validatePayload<T extends object>(
    dtoClass: new () => T,
    body: unknown,
  ) {
    const payload = plainToInstance(dtoClass, body);
    const errors = await validate(payload);

    if (errors.length > 0) {
      throw new WsException('Invalid websocket payload');
    }

    return payload;
  }

  private buildConversationRoom(conversationId: number) {
    return `conversation:${conversationId}`;
  }
}
