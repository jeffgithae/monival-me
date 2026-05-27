import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
  ) {
    return this.reportsService.donorReport(
      user.organizationId,
      projectId,
      fromDate,
      toDate,
    );
  }
}
