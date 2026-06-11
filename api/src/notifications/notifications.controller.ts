import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PERMISSIONS } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @SkipThrottle()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('isRead') isRead?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.list(user.organizationId, user.sub, { isRead, page, limit });
  }

  @Patch(':id/read')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.markRead(user.organizationId, user.sub, id);
  }

  @Post('read-all')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.organizationId, user.sub);
  }

  @Delete(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notificationsService.delete(user.organizationId, user.sub, id);
  }
}