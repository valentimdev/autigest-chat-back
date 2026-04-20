import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SendPushToUserDto } from './dto/send-push-to-user.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(AuthGuard)
  @Post('device-token')
  registerDeviceToken(@Request() request, @Body() body: RegisterPushTokenDto) {
    return this.notificationsService.registerDeviceToken(
      request.user.userId,
      body.token,
      body.platform,
    );
  }

  @UseGuards(AuthGuard)
  @Post('send-to-user')
  sendToUser(@Request() request, @Body() body: SendPushToUserDto) {
    return this.notificationsService.sendToUser({
      senderUserId: request.user.userId,
      targetUserId: body.targetUserId,
      title: body.title ?? 'Nova notificacao',
      body: body.body ?? 'Voce recebeu uma notificacao',
    });
  }
}
