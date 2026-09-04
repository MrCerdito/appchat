import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService, CreateNotificationDto } from './notifications.service';
import { NotificationPreferences } from './user-notification-preference.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findByUser(
      req.user.id,
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '20', 10),
    );
  }

  @Get('unread-count')
  unreadCount(@Request() req: any) {
    return this.svc.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.svc.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllAsRead(@Request() req: any) {
    return this.svc.markAllAsRead(req.user.id);
  }

  @Get('preferences')
  getPreferences(@Request() req: any) {
    return this.svc.getPreferences(req.user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @Request() req: any,
    @Body() body: NotificationPreferences,
  ) {
    return this.svc.updatePreferences(req.user.id, body);
  }
}
