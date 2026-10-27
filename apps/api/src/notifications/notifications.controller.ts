import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  NotificationDto,
  NotificationPreferenceDto,
  PaginatedNotificationsDto,
  RATE_LIMIT_POLICIES,
  UnreadNotificationCountDto,
} from '@devpulse/shared';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { RequireScopes } from '../api-keys/decorators/require-scopes.decorator';
import { RateLimit } from '../rate-limiting/rate-limit.decorator';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Controller('notifications')
@UseGuards(CsrfGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequireScopes('notifications:read')
  @Get('preferences')
  getPreferences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPreferenceDto> {
    return this.notificationsService.getPreferences(user.id);
  }

  @RequireScopes('notifications:write')
  @RateLimit(RATE_LIMIT_POLICIES.NOTIFICATION_MUTATION)
  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    return this.notificationsService.updatePreferences(user.id, dto);
  }

  @RequireScopes('notifications:read')
  @Get('unread-count')
  getUnreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadNotificationCountDto> {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @RequireScopes('notifications:read')
  @Get()
  getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryNotificationsDto,
  ): Promise<PaginatedNotificationsDto> {
    return this.notificationsService.getNotifications(user.id, query);
  }

  @RequireScopes('notifications:write')
  @RateLimit(RATE_LIMIT_POLICIES.NOTIFICATION_MUTATION)
  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationDto> {
    return this.notificationsService.markRead(user.id, id);
  }

  @RequireScopes('notifications:write')
  @RateLimit(RATE_LIMIT_POLICIES.NOTIFICATION_MUTATION)
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.notificationsService.markAllRead(user.id);
  }
}
