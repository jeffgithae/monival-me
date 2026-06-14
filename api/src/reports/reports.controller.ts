import {
  Body, Controller, Delete, Get, Header, Param,
  Post, Put, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PERMISSIONS, OrgRole } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { ReportsService } from './reports.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { BulkImportService, ImportKind } from './bulk-import.service';
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/scheduled-report.dto';

interface UploadedMulterFile { buffer: Buffer; originalname: string; size: number; }

@Controller('reports')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly scheduledReportsService: ScheduledReportsService,
    private readonly bulkImportService: BulkImportService,
  ) {}

  // ── Donor report ───────────────────────────────────────────────────────────

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
      user.organizationId, projectId, fromDate, toDate, reportingPeriodId, user.sub,
    );
  }

  @Get('donor/:projectId/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="evidara-donor-report.csv"')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  donorReportCsv(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('reportingPeriodId') reportingPeriodId?: string,
  ) {
    return this.reportsService.donorReportCsv(
      user.organizationId, projectId, fromDate, toDate, reportingPeriodId, user.sub,
    );
  }

  // ── CSV import templates (download) ────────────────────────────────────────

  @Get('templates/:kind.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  importTemplate(@Param('kind') kind: string) {
    return this.reportsService.importTemplate(kind);
  }

  // ── Bulk CSV import (upload) ───────────────────────────────────────────────

  /**
   * POST /reports/import/:kind
   * Upload a CSV file to bulk-import activities or beneficiaries.
   * kind = 'activities' | 'beneficiaries'
   * Optional query: ?projectId=<id> (used as default project for the rows)
   */
  @Post('import/:kind')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  bulkImport(
    @CurrentUser() user: JwtPayload,
    @Param('kind') kind: string,
    @UploadedFile() file: UploadedMulterFile,
    @Query('projectId') projectId?: string,
  ) {
    if (!file?.buffer) throw new Error('No file uploaded');
    const csvText = file.buffer.toString('utf-8');
    return this.bulkImportService.import(
      user.organizationId,
      user.sub,
      user.role as OrgRole,
      kind as ImportKind,
      csvText,
      projectId,
    );
  }

  // ── Scheduled reports CRUD ─────────────────────────────────────────────────

  @Get('scheduled')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  listScheduled(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.scheduledReportsService.findAll(user.organizationId, projectId);
  }

  @Get('scheduled/:id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  getScheduled(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scheduledReportsService.findOne(user.organizationId, id);
  }

  @Post('scheduled')
  @Roles(...PERMISSIONS.MANAGE_BILLING) // Owner/Admin only — controls email delivery
  createScheduled(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateScheduledReportDto,
  ) {
    return this.scheduledReportsService.create(user.organizationId, user.sub, dto);
  }

  @Put('scheduled/:id')
  @Roles(...PERMISSIONS.MANAGE_BILLING)
  updateScheduled(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateScheduledReportDto,
  ) {
    return this.scheduledReportsService.update(user.organizationId, id, dto);
  }

  @Delete('scheduled/:id')
  @Roles(...PERMISSIONS.MANAGE_BILLING)
  deleteScheduled(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scheduledReportsService.remove(user.organizationId, id);
  }

  /** Manually trigger a scheduled report delivery right now */
  @Post('scheduled/:id/trigger')
  @Roles(...PERMISSIONS.MANAGE_BILLING)
  triggerScheduled(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scheduledReportsService.triggerNow(user.organizationId, id);
  }
}