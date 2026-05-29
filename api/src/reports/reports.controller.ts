import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('donor/:projectId')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  donorReport(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('reportingPeriodId') reportingPeriodId?: string,
  ) {
    return this.reportsService.donorReport(
      user.organizationId,
      projectId,
      fromDate,
      toDate,
      reportingPeriodId,
    );
  }

  @Get('donor/:projectId/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="monival-donor-report.csv"')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  donorReportCsv(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('reportingPeriodId') reportingPeriodId?: string,
  ) {
    return this.reportsService.donorReportCsv(user.organizationId, projectId, fromDate, toDate, reportingPeriodId);
  }

  @Get('templates/:kind.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  importTemplate(@Param('kind') kind: string) {
    return this.reportsService.importTemplate(kind);
  }
}
