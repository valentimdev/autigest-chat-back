import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { GetConversationMessagesQueryDto } from './dto/get-conversation-messages-query.dto';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @UseGuards(AuthGuard)
  @Get('conversations')
  listConversations(@Request() request) {
    return this.chatService.listConversations(request.user.userId);
  }

  @UseGuards(AuthGuard)
  @Get('conversations/:id/messages')
  getConversationMessages(
    @Request() request,
    @Param('id') conversationId: string,
    @Query() query: GetConversationMessagesQueryDto,
  ) {
    return this.chatService.getConversationMessages(
      request.user.userId,
      Number(conversationId),
      query.take ?? 20,
    );
  }

  @UseGuards(AuthGuard)
  @Post('conversations')
  createDirectConversation(
    @Request() request,
    @Body() body: CreateDirectConversationDto,
  ) {
    return this.chatService.createOrGetDirectConversation(
      request.user.userId,
      body.targetUserId,
    );
  }
}
