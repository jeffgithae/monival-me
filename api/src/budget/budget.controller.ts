import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { BudgetService } from './budget.service';
import { CreateBudgetAllocationDto, UpdateBudgetAllocationDto, ApproveBudgetDto, ReviseBudgetDto, BudgetQueryDto, BudgetSummaryQueryDto, CalculateVarianceDto, CreateLineItemDto, UpdateLineItemDto } from './dto/budget.dto';
import type { JwtPayload } from '../common/types/jwt-payload';

@Controller('budget')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // ── Allocations ───────────────────────────────────────────────────────────

  @Post('allocations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  create(@Body() dto: CreateBudgetAllocationDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.createAllocation(dto, user as any);
  }

  @Get('allocations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)
  findAll(@CurrentUser() user: JwtPayload, @Query() query: BudgetQueryDto) {
    return this.budgetService.listAllocations(user.organizationId, query);
  }

  @Get('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.budgetService.getAllocation(id, user.organizationId);
  }

  @Patch('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  update(@Param('id') id: string, @Body() dto: UpdateBudgetAllocationDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.updateAllocation(id, dto, user as any);
  }

  @Post('allocations/:id/approve')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  approve(@Param('id') id: string, @Body() dto: ApproveBudgetDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.approveAllocation(id, dto, user as any);
  }

  @Post('allocations/:id/revise')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  revise(@Param('id') id: string, @Body() dto: ReviseBudgetDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.reviseAllocation(id, dto, user as any);
  }

  @Post('allocations/:id/close')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.budgetService.closeAllocation(id, user as any);
  }

  @Delete('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.budgetService.deleteAllocation(id, user as any);
  }

  // ── Line items ────────────────────────────────────────────────────────────

  @Post('line-items')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  createLineItem(@Body() dto: CreateLineItemDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.createLineItem(dto, user as any);
  }

  @Get('allocations/:id/line-items')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)
  getLineItems(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.budgetService.getLineItemsByAllocation(id, user.organizationId);
  }

  @Patch('line-items/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  updateLineItem(@Param('id') id: string, @Body() dto: UpdateLineItemDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.updateLineItem(id, dto, user as any);
  }

  @Delete('line-items/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  removeLineItem(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.budgetService.deleteLineItem(id, user as any);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  @Post('variance/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  getVariance(@Param('id') id: string, @Body() dto: CalculateVarianceDto, @CurrentUser() user: JwtPayload) {
    return this.budgetService.calculateVariance(id, dto, user as any);
  }

  @Get('summary')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  getSummary(@CurrentUser() user: JwtPayload, @Query() query: BudgetSummaryQueryDto) {
    return this.budgetService.getSummary(user.organizationId, query);
  }

  @Get('audit/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  getAuditLog(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.budgetService.getAuditLog(id, user.organizationId);
  }
}