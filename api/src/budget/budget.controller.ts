import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { BudgetService } from './budget.service';
import { CreateBudgetAllocationDto, UpdateBudgetAllocationDto, ApproveBudgetDto } from './dto/budget.dto';
import { CreateBudgetLineItemDto, UpdateBudgetLineItemDto } from './dto/budget-line-item.dto';

@Controller('budget')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  // ========== BUDGET ALLOCATION ENDPOINTS ==========

  @Post('allocations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async createAllocation(@CurrentUser() user: any, @Body() createDto: CreateBudgetAllocationDto) {
    return this.budgetService.createBudgetAllocation(user.organizationId, createDto);
  }

  @Get('allocations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getAllocations(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.budgetService.getBudgetAllocations(user.organizationId, {
      status,
      fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : undefined,
      projectId,
    });
  }

  @Get('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getAllocation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.budgetService.getBudgetAllocation(id, user.organizationId);
  }

  @Patch('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async updateAllocation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateBudgetAllocationDto,
  ) {
    return this.budgetService.updateBudgetAllocation(id, user.organizationId, updateDto);
  }

  @Post('allocations/:id/approve')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async approveBudget(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() approveDto: ApproveBudgetDto,
  ) {
    return this.budgetService.approveBudget(id, user.organizationId, approveDto.approverUserId);
  }

  @Delete('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async deleteAllocation(@CurrentUser() user: any, @Param('id') id: string) {
    await this.budgetService.deleteBudgetAllocation(id, user.organizationId);
    return { message: 'Budget allocation deleted' };
  }

  // ========== BUDGET LINE ITEM ENDPOINTS ==========

  @Post('line-items')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async createLineItem(@CurrentUser() user: any, @Body() createDto: CreateBudgetLineItemDto) {
    return this.budgetService.createLineItem(user.organizationId, createDto);
  }

  @Get('line-items/:budgetAllocationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getLineItems(@CurrentUser() user: any, @Param('budgetAllocationId') budgetAllocationId: string) {
    return this.budgetService.getLineItems(user.organizationId, budgetAllocationId);
  }

  @Patch('line-items/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async updateLineItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateBudgetLineItemDto,
  ) {
    return this.budgetService.updateLineItem(id, user.organizationId, updateDto);
  }

  @Delete('line-items/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async deleteLineItem(@CurrentUser() user: any, @Param('id') id: string) {
    await this.budgetService.deleteLineItem(id, user.organizationId);
    return { message: 'Line item deleted' };
  }

  // ========== VARIANCE ANALYSIS ENDPOINTS ==========

  @Post('variance/:budgetAllocationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async calculateVariance(
    @CurrentUser() user: any,
    @Param('budgetAllocationId') budgetAllocationId: string,
    @Body() body: { period: string },
  ) {
    return this.budgetService.calculateVariance(budgetAllocationId, user.organizationId, body.period);
  }

  @Get('variance/:budgetAllocationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getVarianceAnalysis(
    @CurrentUser() user: any,
    @Param('budgetAllocationId') budgetAllocationId: string,
    @Query('fromPeriod') fromPeriod?: string,
    @Query('toPeriod') toPeriod?: string,
  ) {
    return this.budgetService.getVarianceAnalysis(budgetAllocationId, user.organizationId, fromPeriod, toPeriod);
  }

  // ========== SUMMARY ENDPOINTS ==========

  @Get('summary/:organizationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getBudgetSummary(@CurrentUser() user: any, @Query('fiscalYear') fiscalYear?: string) {
    return this.budgetService.getBudgetSummary(
      user.organizationId,
      fiscalYear ? parseInt(fiscalYear, 10) : undefined,
    );
  }
}
