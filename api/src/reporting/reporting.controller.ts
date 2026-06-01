import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PERMISSIONS } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateReportingPeriodDto, ReviewReportingPeriodDto, UpsertIndicatorResultDto, UpsertIndicatorTargetDto } from './dto/reporting.dto';
import { ReportingService } from './reporting.service';

@Controller('reporting')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

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
    return this.reportingService.transitionPeriod(user.organizationId, id, dto.status, user.sub);
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
  dataQuality(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string) {
    return this.reportingService.dataQuality(user.organizationId, projectId);
  }
}
