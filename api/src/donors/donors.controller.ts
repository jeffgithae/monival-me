import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
import { AddEngagementDto } from './dto/add-engagement.dto';
import { AddComplianceConditionDto, UpdateComplianceConditionDto } from './dto/add-compliance-condition.dto';
import { DonorsService } from './donors.service';

@Controller('donors')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class DonorsController {
  constructor(private readonly donorsService: DonorsService) {}

  // ─── Portfolio-level ───────────────────────────────────────────────────────

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('type')   type?: string,
    @Query('search') search?: string,
    @Query('tag')    tag?: string,
  ) {
    return this.donorsService.findAll(user.organizationId, { status, type, search, tag });
  }

  @Get('portfolio-summary')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  portfolioSummary(@CurrentUser() user: JwtPayload) {
    return this.donorsService.getPortfolioSummary(user.organizationId);
  }

  @Get('export')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  async exportPortfolio(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const rows = await this.donorsService.exportPortfolio(user.organizationId);

    if (!rows.length) {
      res.status(HttpStatus.NO_CONTENT).send();
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const val = String(r[h] ?? '').replace(/"/g, '""');
          return val.includes(',') || val.includes('"') ? `"${val}"` : val;
        }).join(',')
      ),
    ].join('\r\n');

    res
      .setHeader('Content-Type', 'text/csv')
      .setHeader('Content-Disposition', 'attachment; filename="donors-export.csv"')
      .send(csv);
  }

  // ─── Single donor ──────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.findOne(user.organizationId, id);
  }

  @Get(':id/profile')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  donorProfile(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.getDonorProfile(user.organizationId, id);
  }

  @Get(':id/grants')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  donorGrants(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.findGrantsByDonor(user.organizationId, id);
  }

  @Get(':id/deadlines')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  upcomingDeadlines(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.getUpcomingDeadlines(user.organizationId, id);
  }

  @Get(':id/performance')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  performanceReport(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.getDonorPerformanceReport(user.organizationId, id);
  }

  @Get(':id/audit')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  auditLog(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.getAuditLog(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDonorDto) {
    return this.donorsService.create(user.organizationId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateDonorDto) {
    return this.donorsService.update(user.organizationId, id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.remove(user.organizationId, id, user.sub);
  }

  // ─── Engagement log ────────────────────────────────────────────────────────

  @Post(':id/engagements')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  addEngagement(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddEngagementDto,
  ) {
    return this.donorsService.addEngagement(user.organizationId, id, dto, user.sub);
  }

  @Delete(':id/engagements/:engagementId')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  @HttpCode(HttpStatus.OK)
  removeEngagement(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
  ) {
    return this.donorsService.removeEngagement(user.organizationId, id, engagementId, user.sub);
  }

  // ─── Compliance conditions ─────────────────────────────────────────────────

  @Post(':id/compliance')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  addComplianceCondition(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddComplianceConditionDto,
  ) {
    return this.donorsService.addComplianceCondition(user.organizationId, id, dto, user.sub);
  }

  @Patch(':id/compliance/:conditionId')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  updateComplianceCondition(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('conditionId') conditionId: string,
    @Body() dto: UpdateComplianceConditionDto,
  ) {
    return this.donorsService.updateComplianceCondition(
      user.organizationId, id, conditionId, dto, user.sub,
    );
  }
}