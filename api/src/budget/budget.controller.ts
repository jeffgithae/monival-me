// import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../common/guards/roles.guard';
// import { SubscriptionGuard } from '../common/guards/subscription.guard';
// import { CurrentUser } from '../common/decorators/current-user.decorator';
// import { Roles } from '../common/decorators/roles.decorator';
// import { OrgRole } from '../common/constants/roles';
// import { BudgetService } from './budget.service';
// import { CreateBudgetAllocationDto, UpdateBudgetAllocationDto, ApproveBudgetDto } from './dto/budget.dto';
// import { CreateBudgetLineItemDto, UpdateBudgetLineItemDto } from './dto/budget-line-item.dto';

// @Controller('budget')
// @UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
// export class BudgetController {
//   constructor(private budgetService: BudgetService) {}

//   // ========== BUDGET ALLOCATION ENDPOINTS ==========

//   @Post('allocations')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
//   async createAllocation(@CurrentUser() user: any, @Body() createDto: CreateBudgetAllocationDto) {
//     return this.budgetService.createBudgetAllocation(user.organizationId, createDto);
//   }

//   @Get('allocations')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
//   async getAllocations(
//     @CurrentUser() user: any,
//     @Query('status') status?: string,
//     @Query('fiscalYear') fiscalYear?: string,
//     @Query('projectId') projectId?: string,
//   ) {
//     return this.budgetService.getBudgetAllocations(user.organizationId, {
//       status,
//       fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : undefined,
//       projectId,
//     });
//   }

//   @Get('allocations/:id')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
//   async getAllocation(@CurrentUser() user: any, @Param('id') id: string) {
//     return this.budgetService.getBudgetAllocation(id, user.organizationId);
//   }

//   @Patch('allocations/:id')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
//   async updateAllocation(
//     @CurrentUser() user: any,
//     @Param('id') id: string,
//     @Body() updateDto: UpdateBudgetAllocationDto,
//   ) {
//     return this.budgetService.updateBudgetAllocation(id, user.organizationId, updateDto);
//   }

//   @Post('allocations/:id/approve')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN)
//   async approveBudget(
//     @CurrentUser() user: any,
//     @Param('id') id: string,
//     @Body() approveDto: ApproveBudgetDto,
//   ) {
//     return this.budgetService.approveBudget(id, user.organizationId, approveDto.approverUserId);
//   }

//   @Delete('allocations/:id')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN)
//   async deleteAllocation(@CurrentUser() user: any, @Param('id') id: string) {
//     await this.budgetService.deleteBudgetAllocation(id, user.organizationId);
//     return { message: 'Budget allocation deleted' };
//   }

//   // ========== BUDGET LINE ITEM ENDPOINTS ==========

//   @Post('line-items')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
//   async createLineItem(@CurrentUser() user: any, @Body() createDto: CreateBudgetLineItemDto) {
//     return this.budgetService.createLineItem(user.organizationId, createDto);
//   }

//   @Get('line-items/:budgetAllocationId')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
//   async getLineItems(@CurrentUser() user: any, @Param('budgetAllocationId') budgetAllocationId: string) {
//     return this.budgetService.getLineItems(user.organizationId, budgetAllocationId);
//   }

//   @Patch('line-items/:id')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
//   async updateLineItem(
//     @CurrentUser() user: any,
//     @Param('id') id: string,
//     @Body() updateDto: UpdateBudgetLineItemDto,
//   ) {
//     return this.budgetService.updateLineItem(id, user.organizationId, updateDto);
//   }

//   @Delete('line-items/:id')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
//   async deleteLineItem(@CurrentUser() user: any, @Param('id') id: string) {
//     await this.budgetService.deleteLineItem(id, user.organizationId);
//     return { message: 'Line item deleted' };
//   }

//   // ========== VARIANCE ANALYSIS ENDPOINTS ==========

//   @Post('variance/:budgetAllocationId')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
//   async calculateVariance(
//     @CurrentUser() user: any,
//     @Param('budgetAllocationId') budgetAllocationId: string,
//     @Body() body: { period: string },
//   ) {
//     return this.budgetService.calculateVariance(budgetAllocationId, user.organizationId, body.period);
//   }

//   @Get('variance/:budgetAllocationId')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
//   async getVarianceAnalysis(
//     @CurrentUser() user: any,
//     @Param('budgetAllocationId') budgetAllocationId: string,
//     @Query('fromPeriod') fromPeriod?: string,
//     @Query('toPeriod') toPeriod?: string,
//   ) {
//     return this.budgetService.getVarianceAnalysis(budgetAllocationId, user.organizationId, fromPeriod, toPeriod);
//   }

//   // ========== SUMMARY ENDPOINTS ==========

//   @Get('summary/:organizationId')
//   @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
//   async getBudgetSummary(@CurrentUser() user: any, @Query('fiscalYear') fiscalYear?: string) {
//     return this.budgetService.getBudgetSummary(
//       user.organizationId,
//       fiscalYear ? parseInt(fiscalYear, 10) : undefined,
//     );
//   }
// }


import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiParam, ApiResponse,
} from '@nestjs/swagger';

import { BudgetService } from './budget.service';
import {
  CreateBudgetAllocationDto, UpdateBudgetAllocationDto,
  ApproveBudgetDto, ReviseBudgetDto,
  CreateLineItemDto, UpdateLineItemDto,
  CalculateVarianceDto, BudgetQueryDto,
  VarianceQueryDto, BudgetSummaryQueryDto,
} from './dto/budget.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { OrgRole } from '../common/constants/roles';



@ApiTags('Budget Tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // ALLOCATIONS
  // ══════════════════════════════════════════════════════════════════════════

  @Post('allocations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({ summary: 'Create a new budget allocation' })
  @ApiResponse({ status: 201, description: 'Allocation created' })
  createAllocation(@Body() dto: CreateBudgetAllocationDto, @Request() req: any) {
    return this.budgetService.createAllocation(dto, req.user);
  }

  @Get('allocations')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  @ApiOperation({ summary: 'List all budget allocations (paginated, filterable)' })
  listAllocations(@Query() query: BudgetQueryDto, @Request() req: any) {
    return this.budgetService.listAllocations(String(req.user.organizationId), query);
  }

  @Get('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get a single budget allocation with full detail' })
  @ApiParam({ name: 'id', description: 'Budget allocation ID' })
  getAllocation(@Param('id') id: string, @Request() req: any) {
    return this.budgetService.getAllocation(id, String(req.user.organizationId));
  }

  @Patch('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({ summary: 'Update a budget allocation' })
  updateAllocation(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetAllocationDto,
    @Request() req: any,
  ) {
    return this.budgetService.updateAllocation(id, dto, req.user);
  }

  @Post('allocations/:id/approve')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Approve a budget allocation (draft → approved)' })
  @HttpCode(HttpStatus.OK)
  approveAllocation(
    @Param('id') id: string,
    @Body() dto: ApproveBudgetDto,
    @Request() req: any,
  ) {
    return this.budgetService.approveAllocation(id, dto, req.user);
  }

  /**
   * Records who changed the amount, why, and when — immutable audit trail.
   */
  @Post('allocations/:id/revise')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({
    summary: 'Revise a budget allocation amount (records full revision history)',
    description:
      'Creates an immutable revision entry before updating the amount. ' +
      'Required for donor-amendment compliance workflows.',
  })
  @HttpCode(HttpStatus.OK)
  reviseAllocation(
    @Param('id') id: string,
    @Body() dto: ReviseBudgetDto,
    @Request() req: any,
  ) {
    return this.budgetService.reviseAllocation(id, dto, req.user);
  }

  @Post('allocations/:id/close')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Close an active budget allocation' })
  @HttpCode(HttpStatus.OK)
  closeAllocation(@Param('id') id: string, @Request() req: any) {
    return this.budgetService.closeAllocation(id, req.user);
  }

  @Delete('allocations/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Soft-delete a draft budget allocation' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAllocation(@Param('id') id: string, @Request() req: any) {
    return this.budgetService.deleteAllocation(id, req.user);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LINE ITEMS
  // ══════════════════════════════════════════════════════════════════════════

  @Post('line-items')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({
    summary: 'Create a budget line item',
    description:
      'Validates against allowedExpenseTypes on the parent budget and ' +
      'checks uncommitted headroom. Updates parent committed/uncommitted amounts.',
  })
  createLineItem(@Body() dto: CreateLineItemDto, @Request() req: any) {
    return this.budgetService.createLineItem(dto, req.user);
  }

  @Get('line-items/:allocationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get all line items for a budget allocation' })
  @ApiParam({ name: 'allocationId', description: 'Budget allocation ID' })
  getLineItems(@Param('allocationId') allocationId: string, @Request() req: any) {
    return this.budgetService.getLineItemsByAllocation(allocationId, String(req.user.organizationId));
  }

  @Patch('line-items/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({ summary: 'Update a line item (spent, status, attachments, invoice ref)' })
  updateLineItem(
    @Param('id') id: string,
    @Body() dto: UpdateLineItemDto,
    @Request() req: any,
  ) {
    return this.budgetService.updateLineItem(id, dto, req.user);
  }

  @Delete('line-items/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({ summary: 'Soft-delete a line item (returns committed amount to parent)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLineItem(@Param('id') id: string, @Request() req: any) {
    return this.budgetService.deleteLineItem(id, req.user);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANCE & BURN RATE
  // ══════════════════════════════════════════════════════════════════════════

  @Post('variance/:allocationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  @ApiOperation({
    summary: 'Calculate and persist variance for a period',
    description:
      'Computes budgeted vs actual for the given YYYY-MM period. ' +
      'Auto-determines alert level against configured thresholds. ' +
      'Stores burn-rate snapshot on the allocation for trend analysis.',
  })
  calculateVariance(
    @Param('allocationId') allocationId: string,
    @Body() dto: CalculateVarianceDto,
    @Request() req: any,
  ) {
    return this.budgetService.calculateVariance(allocationId, dto, req.user);
  }

  @Get('variance/:allocationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get variance analysis for a budget across periods' })
  getVarianceAnalysis(
    @Param('allocationId') allocationId: string,
    @Query() query: VarianceQueryDto,
    @Request() req: any,
  ) {
    return this.budgetService.getVarianceAnalysis(allocationId, String(req.user.organizationId), query);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  @Get('summary/:organizationId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  @ApiOperation({
    summary: 'Portfolio budget summary — totals, burn rate, by-category, alerts',
    description:
      'Returns organisation-wide budget health: total allocated/spent/uncommitted, ' +
      'overall burn rate, year-end projection, count of alerted budgets, and per-category breakdown.',
  })
  async getSummary(
    @Param('organizationId') organizationId: string,
    @Query() query: BudgetSummaryQueryDto,
  ) {
    return this.budgetService.getSummary(organizationId, query);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ══════════════════════════════════════════════════════════════════════════

  @Get('audit/:entityId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary: 'Get full audit trail for a budget entity',
    description: 'Returns every create/update/approve/revise/close action taken on the entity.',
  })
  getAuditLog(@Param('entityId') entityId: string, @Request() req: any) {
    return this.budgetService.getAuditLog(entityId, String(req.user.organizationId));
  }
}