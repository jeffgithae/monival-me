import { Controller, Get, UseGuards } from '@nestjs/common';
import { CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../common/types/jwt-payload';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Dashboard overview — cached 30s per org.
   * Heavy: 7 DB queries. SkipThrottle so page loads don't exhaust limits.
   */
  @Get('overview')
  @SkipThrottle()
  @CacheKey('dashboard:overview')
  @CacheTTL(30_000)
  overview(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.overview(user.organizationId);
  }
}