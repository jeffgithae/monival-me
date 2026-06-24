import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { SkipThrottle } from '@nestjs/throttler';
import type { JwtPayload } from '../common/types/jwt-payload';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
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

  /**
   * Adaptive Management Insights Engine.
   *
   * Cross-correlates grants, indicators, activities, and reporting periods to
   * surface actionable insights ranked by severity:
   *   - critical: high burn + low impact, overdue reports, stale indicators
   *   - warning:  grant expiry risk, spend-ahead-of-impact
   *   - opportunity: budget headroom + high impact
   *   - info:     evidence gaps, approval backlogs
   *
   * Optional `projectId` narrows scope to a single project.
   */
  @Get('insights')
  @ApiOperation({ summary: 'Adaptive management insights — actionable cross-module alerts' })
  insights(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.dashboardService.insights(user.organizationId, projectId);
  }

  /**
   * ROI & Cost-per-Impact Calculator.
   *
   * Bridges grant financials → approved activities → indicator results to
   * produce a per-indicator cost-efficiency table and portfolio-level summary.
   * Useful for donor proposals and internal resource allocation decisions.
   */
  @Get('roi')
  @ApiOperation({ summary: 'Financial-programmatic ROI: cost per unit of impact per indicator' })
  roi(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.dashboardService.roi(user.organizationId, projectId);
  }
}