import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { GrantsService } from './grants.service';
import { CreateGrantDto } from './dto/create-grant.dto';
import { UpdateGrantDto } from './dto/update-grant.dto';
import {
  AddDisbursementDto,
  UpdateDisbursementDto,
  AddReportingObligationDto,
  UpdateReportingObligationDto,
  RecordAmendmentDto,
  UpdateSpendingDto,
} from './dto/grant-detail.dto';

const READ_ROLES = [
  OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE,
  OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.VIEWER,
] as const;
const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE] as const;

@Controller('grants')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class GrantsController {
  constructor(private grantsService: GrantsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(@CurrentUser() user: any, @Body() createGrantDto: CreateGrantDto) {
    return this.grantsService.create(user.organizationId, createGrantDto, String(user.sub ?? user._id));
  }

  @Get()
  @Roles(...READ_ROLES)
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('donorId') donorId?: string,
    @Query('search') search?: string,
    @Query('parentGrantId') parentGrantId?: string,
    @Query('primeOnly') primeOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.grantsService.findAll(user.organizationId, {
      status, donorId, search, parentGrantId,
      primeOnly: primeOnly === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('summary')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getSummary(@CurrentUser() user: any) {
    return this.grantsService.getBudgetSummary(user.organizationId);
  }

  @Get('budget-summary')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getBudgetSummary(@CurrentUser() user: any) {
    return this.getSummary(user);
  }

  @Get('expiring')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async getExpiringGrants(@CurrentUser() user: any, @Query('days') days?: string) {
    const daysUntilExpiry = days ? parseInt(days, 10) : 30;
    return this.grantsService.getExpiringGrants(user.organizationId, daysUntilExpiry);
  }

  /** Upcoming + overdue donor reports across the portfolio. */
  @Get('reports-due')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async getUpcomingReports(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.grantsService.getUpcomingReports(
      user.organizationId,
      days ? parseInt(days, 10) : 90,
    );
  }

  @Get('by-project/:projectId')
  @Roles(...READ_ROLES)
  async getGrantsByProject(@CurrentUser() user: any, @Param('projectId') projectId: string) {
    return this.grantsService.getGrantsByProject(user.organizationId, projectId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.grantsService.getOne(id, user.organizationId);
  }

  /** Prime award plus its sub-awards and the committed/retained split. */
  @Get(':id/award-tree')
  @Roles(...READ_ROLES)
  async getAwardTree(@CurrentUser() user: any, @Param('id') id: string) {
    return this.grantsService.getAwardTree(id, user.organizationId);
  }

  /** Budget allocations, cost categories and burn rate rolled up to the award. */
  @Get(':id/financials')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getFinancials(@CurrentUser() user: any, @Param('id') id: string) {
    return this.grantsService.getFinancialRollup(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateGrantDto: UpdateGrantDto,
  ) {
    return this.grantsService.update(id, user.organizationId, updateGrantDto);
  }

  @Patch(':id/spending')
  @Roles(...WRITE_ROLES)
  async updateSpending(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: UpdateSpendingDto,
  ) {
    return this.grantsService.updateGrantSpending(id, user.organizationId, body.amountSpent);
  }

  // ─── Disbursements ──────────────────────────────────────────────────────────

  @Post(':id/disbursements')
  @Roles(...WRITE_ROLES)
  async addDisbursement(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddDisbursementDto) {
    return this.grantsService.addDisbursement(id, user.organizationId, dto, user.sub);
  }

  @Patch(':id/disbursements/:disbursementId')
  @Roles(...WRITE_ROLES)
  async updateDisbursement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('disbursementId') disbursementId: string,
    @Body() dto: UpdateDisbursementDto,
  ) {
    return this.grantsService.updateDisbursement(id, disbursementId, user.organizationId, dto, user.sub);
  }

  @Delete(':id/disbursements/:disbursementId')
  @Roles(...WRITE_ROLES)
  async removeDisbursement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('disbursementId') disbursementId: string,
  ) {
    return this.grantsService.removeDisbursement(id, disbursementId, user.organizationId, user.sub);
  }

  // ─── Reporting obligations ──────────────────────────────────────────────────

  @Post(':id/obligations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async addObligation(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddReportingObligationDto) {
    return this.grantsService.addObligation(id, user.organizationId, dto, user.sub);
  }

  @Patch(':id/obligations/:obligationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async updateObligation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('obligationId') obligationId: string,
    @Body() dto: UpdateReportingObligationDto,
  ) {
    return this.grantsService.updateObligation(id, obligationId, user.organizationId, dto, user.sub);
  }

  @Delete(':id/obligations/:obligationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async removeObligation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('obligationId') obligationId: string,
  ) {
    return this.grantsService.removeObligation(id, obligationId, user.organizationId, user.sub);
  }

  // ─── Amendments ─────────────────────────────────────────────────────────────

  @Post(':id/amendments')
  @Roles(...WRITE_ROLES)
  async recordAmendment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordAmendmentDto) {
    return this.grantsService.recordAmendment(id, user.organizationId, dto, user.sub);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.grantsService.remove(id, user.organizationId, user.sub);
  }
}
