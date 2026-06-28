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
   *
   * NOTE: must use a request-aware key factory, not a static @CacheKey()
   * string. A static key is shared across every organization — see
   * CacheInterceptor#trackBy in @nestjs/cache-manager: when
   * CACHE_KEY_METADATA is present it's returned verbatim, bypassing the
   * per-request URL-based key NestJS would otherwise generate. This was
   * previously the exact bug on /reporting/data-quality; this endpoint —
   * the most-viewed page in the app — had the same bug independently.
   */
  @Get('overview')
  @SkipThrottle()
  @CacheKey((context) => {
    const req = context.switchToHttp().getRequest();
    return `dashboard:overview:${req.user?.organizationId}`;
  })
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

  /**
   * Unique Beneficiary Reach.
   *
   * Distinguishes cumulative attendance (sum of Activity.participants,
   * double-counts repeat attendees) from unique people actually served
   * (distinct Beneficiary records linked via Activity.beneficiaryIds).
   * Includes a coveragePct so the UI can show how much of the figure is
   * backed by real linkage data rather than presenting a partial count as
   * comprehensive.
   */
  @Get('beneficiary-reach')
  @ApiOperation({ summary: 'Unique beneficiaries reached vs. cumulative attendance, with sex/age/disability breakdown' })
  beneficiaryReach(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.dashboardService.beneficiaryReach(user.organizationId, projectId);
  }

  /**
   * Geo-tagged points for map visualization, across activities,
   * beneficiaries (anonymized/clustered — see service docstring),
   * partners, and projects.
   */
  @Get('geo')
  @ApiOperation({ summary: 'Geo-tagged activity/beneficiary/partner/project points for map display' })
  geoData(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('types') types?: string,
  ) {
    return this.dashboardService.geoData(
      user.organizationId,
      projectId,
      types ? types.split(',').filter(Boolean) : undefined,
    );
  }
}