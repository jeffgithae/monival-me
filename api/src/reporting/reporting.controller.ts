import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PERMISSIONS } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateReportingPeriodDto, ReviewReportingPeriodDto, UpdateNarrativeDto, UpdateReportingPeriodDto, UpsertIndicatorResultDto, UpsertIndicatorTargetDto } from './dto/reporting.dto';
import { ReportingService } from './reporting.service';
import { ReportingExportService } from './reporting-export.service';

@Controller('reporting')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly exportService: ReportingExportService,
  ) {}

  @Get('periods')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  listPeriods(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
  ) {
    return this.reportingService.listPeriods(user.organizationId, projectId, status);
  }

  @Post('periods')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  createPeriod(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportingPeriodDto) {
    return this.reportingService.createPeriod(user.organizationId, dto);
  }

  @Patch('periods/:id')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  updatePeriod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReportingPeriodDto,
  ) {
    return this.reportingService.updatePeriod(user.organizationId, id, dto);
  }

  @Get('periods/:id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  getPeriod(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reportingService.getPeriod(user.organizationId, id);
  }

  @Post('periods/:id/calculate')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  calculate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reportingService.calculateResults(user.organizationId, id);
  }

  @Patch('periods/:id/status')
  @Roles(...PERMISSIONS.APPROVE_ACTIVITIES)
  transitionPeriod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewReportingPeriodDto,
  ) {
    return this.reportingService.transitionPeriod(user.organizationId, id, dto.status, user.sub, dto.notes);
  }

  @Patch('periods/:id/narrative')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  updateNarrative(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateNarrativeDto,
  ) {
    return this.reportingService.updateNarrative(user.organizationId, id, dto);
  }

  @Get('periods/:id/export')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  async exportPeriod(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (format !== 'pdf' && format !== 'excel') {
      throw new BadRequestException("format must be 'pdf' or 'excel'");
    }

    if (format === 'pdf') {
      const buffer = await this.exportService.exportPdf(user.organizationId, id);
      res
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="reporting-period-${id}.pdf"`)
        .send(buffer);
      return;
    }

    const buffer = await this.exportService.exportExcel(user.organizationId, id);
    res
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="reporting-period-${id}.xlsx"`)
      .send(buffer);
  }

  @Get('results')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  listResults(
    @CurrentUser() user: JwtPayload,
    @Query('reportingPeriodId') reportingPeriodId: string,
  ) {
    return this.reportingService.listResults(user.organizationId, reportingPeriodId);
  }

  @Post('results')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  upsertResult(@CurrentUser() user: JwtPayload, @Body() dto: UpsertIndicatorResultDto) {
    return this.reportingService.upsertResult(user.organizationId, dto);
  }

  @Get('targets')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  listTargets(
    @CurrentUser() user: JwtPayload,
    @Query('reportingPeriodId') reportingPeriodId: string,
  ) {
    return this.reportingService.listTargets(user.organizationId, reportingPeriodId);
  }

  @Post('targets')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  upsertTarget(@CurrentUser() user: JwtPayload, @Body() dto: UpsertIndicatorTargetDto) {
    return this.reportingService.upsertTarget(user.organizationId, dto);
  }

  @Get('data-quality')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @SkipThrottle()
  // NOTE: a static @CacheKey() previously sat here ('reporting:data-quality').
  // That makes every organization/project/period share one global 5-minute
  // cache slot — see CacheInterceptor#trackBy in @nestjs/cache-manager: when
  // CACHE_KEY_METADATA is present it's returned verbatim, bypassing the
  // per-request URL+query key NestJS would otherwise generate. A factory
  // function keys on the actual request instead, so each org/project/period
  // combination gets its own cache entry.
  @CacheKey((context) => {
    const req = context.switchToHttp().getRequest();
    return `reporting:data-quality:${req.user?.organizationId}:${req.query?.projectId ?? 'all'}:${req.query?.periodId ?? 'all'}`;
  })
  @CacheTTL(300_000) // 5 minutes — expensive aggregation
  async dataQuality(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('periodId') periodId?: string,
  ) {
    if (!periodId) {
      return this.reportingService.dataQuality(user.organizationId, projectId);
    }
    const period = await this.reportingService.getPeriod(user.organizationId, periodId);
    return this.reportingService.dataQuality(user.organizationId, projectId ?? period.projectId?.toString(), {
      from: new Date(period.startDate),
      to: new Date(period.endDate),
    });
  }
}