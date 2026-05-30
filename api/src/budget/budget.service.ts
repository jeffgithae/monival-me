// import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model, Types } from 'mongoose';
// import { BudgetAllocation, BudgetAllocationDocument } from './schemas/budget-allocation.schema';
// import { BudgetLineItem, BudgetLineItemDocument } from './schemas/budget-line-item.schema';
// import { BudgetVariance, BudgetVarianceDocument } from './schemas/budget-variance.schema';
// import { CreateBudgetAllocationDto, UpdateBudgetAllocationDto } from './dto/budget.dto';
// import { CreateBudgetLineItemDto, UpdateBudgetLineItemDto } from './dto/budget-line-item.dto';

// @Injectable()
// export class BudgetService {
//   constructor(
//     @InjectModel(BudgetAllocation.name) private budgetAllocationModel: Model<BudgetAllocationDocument>,
//     @InjectModel(BudgetLineItem.name) private budgetLineItemModel: Model<BudgetLineItemDocument>,
//     @InjectModel(BudgetVariance.name) private budgetVarianceModel: Model<BudgetVarianceDocument>,
//   ) {}

//   // ========== BUDGET ALLOCATION METHODS ==========

//   async createBudgetAllocation(
//     organizationId: string,
//     createDto: CreateBudgetAllocationDto,
//   ): Promise<BudgetAllocationDocument> {
//     const allocation = new this.budgetAllocationModel({
//       ...createDto,
//       organizationId: new Types.ObjectId(organizationId),
//       projectId: createDto.projectId ? new Types.ObjectId(createDto.projectId) : undefined,
//       uncommittedAmount: createDto.allocatedAmount,
//     });
//     return allocation.save();
//   }

//   async getBudgetAllocations(organizationId: string, filters?: {
//     status?: string;
//     fiscalYear?: number;
//     projectId?: string;
//   }): Promise<BudgetAllocationDocument[]> {
//     const query: any = { organizationId: new Types.ObjectId(organizationId) };

//     if (filters?.status) query.status = filters.status;
//     if (filters?.fiscalYear) query.fiscalYear = filters.fiscalYear;
//     if (filters?.projectId) query.projectId = new Types.ObjectId(filters.projectId);

//     return this.budgetAllocationModel
//       .find(query)
//       .sort({ fiscalYear: -1, createdAt: -1 })
//       .populate(['projectId', 'createdBy', 'approvedBy']);
//   }

//   async getBudgetAllocation(id: string, organizationId: string): Promise<BudgetAllocationDocument> {
//     const allocation = await this.budgetAllocationModel
//       .findById(id)
//       .populate(['projectId', 'createdBy', 'approvedBy']);

//     if (!allocation || allocation.organizationId.toString() !== organizationId) {
//       throw new NotFoundException('Budget allocation not found');
//     }

//     return allocation;
//   }

//   async updateBudgetAllocation(
//     id: string,
//     organizationId: string,
//     updateDto: UpdateBudgetAllocationDto,
//   ): Promise<BudgetAllocationDocument> {
//     const allocation = await this.getBudgetAllocation(id, organizationId);

//     const updateData: Record<string, any> = { ...updateDto };
//     Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

//     const updated = await this.budgetAllocationModel
//       .findByIdAndUpdate(id, updateData, { new: true })
//       .populate(['projectId', 'createdBy', 'approvedBy']);

//     if (!updated) throw new NotFoundException('Budget allocation not found');
//     return updated;
//   }

//   async approveBudget(id: string, organizationId: string, approverUserId: string): Promise<BudgetAllocationDocument> {
//     const allocation = await this.getBudgetAllocation(id, organizationId);

//     if (allocation.status !== 'draft') {
//       throw new ForbiddenException('Only draft budgets can be approved');
//     }

//     const updated = await this.budgetAllocationModel
//       .findByIdAndUpdate(
//         id,
//         {
//           status: 'approved',
//           approvedBy: new Types.ObjectId(approverUserId),
//           approvalDate: new Date(),
//         },
//         { new: true },
//       )
//       .populate(['projectId', 'createdBy', 'approvedBy']);

//     if (!updated) {
//       throw new NotFoundException('Budget allocation not found');
//     }

//     return updated;
//   }

//   async deleteBudgetAllocation(id: string, organizationId: string): Promise<void> {
//     const allocation = await this.getBudgetAllocation(id, organizationId);

//     if (allocation.status === 'active' || allocation.status === 'closed') {
//       throw new ForbiddenException('Cannot delete active or closed budgets');
//     }

//     await this.budgetAllocationModel.findByIdAndDelete(id);
//     await this.budgetLineItemModel.deleteMany({ budgetAllocationId: new Types.ObjectId(id) });
//     await this.budgetVarianceModel.deleteMany({ budgetAllocationId: new Types.ObjectId(id) });
//   }

//   // ========== BUDGET LINE ITEM METHODS ==========

//   async createLineItem(
//     organizationId: string,
//     createDto: CreateBudgetLineItemDto,
//   ): Promise<BudgetLineItemDocument> {
//     const allocation = await this.getBudgetAllocation(createDto.budgetAllocationId, organizationId);

//     if (createDto.amount > allocation.allocatedAmount) {
//       throw new ForbiddenException('Line item amount exceeds budget allocation');
//     }

//     const lineItem = new this.budgetLineItemModel({
//       ...createDto,
//       organizationId: new Types.ObjectId(organizationId),
//       budgetAllocationId: new Types.ObjectId(createDto.budgetAllocationId),
//       linkedActivity: createDto.linkedActivity ? new Types.ObjectId(createDto.linkedActivity) : undefined,
//     });

//     const saved = await lineItem.save();

//     // Update uncommitted amount
//     await this.updateUncommittedAmount(createDto.budgetAllocationId);

//     return saved;
//   }

//   async getLineItems(organizationId: string, budgetAllocationId: string): Promise<BudgetLineItemDocument[]> {
//     return this.budgetLineItemModel
//       .find({
//         organizationId: new Types.ObjectId(organizationId),
//         budgetAllocationId: new Types.ObjectId(budgetAllocationId),
//       })
//       .populate('linkedActivity');
//   }

//   async updateLineItem(
//     id: string,
//     organizationId: string,
//     updateDto: UpdateBudgetLineItemDto,
//   ): Promise<BudgetLineItemDocument> {
//     const lineItem = await this.budgetLineItemModel.findById(id);

//     if (!lineItem || lineItem.organizationId.toString() !== organizationId) {
//       throw new NotFoundException('Line item not found');
//     }

//     const updated = await this.budgetLineItemModel
//       .findByIdAndUpdate(id, updateDto, { new: true })
//       .populate('linkedActivity');

//     if (!updated) {
//       throw new NotFoundException('Line item not found');
//     }

//     await this.updateUncommittedAmount(lineItem.budgetAllocationId.toString());

//     return updated;
//   }

//   async deleteLineItem(id: string, organizationId: string): Promise<void> {
//     const lineItem = await this.budgetLineItemModel.findById(id);

//     if (!lineItem || lineItem.organizationId.toString() !== organizationId) {
//       throw new NotFoundException('Line item not found');
//     }

//     await this.budgetLineItemModel.findByIdAndDelete(id);
//     await this.updateUncommittedAmount(lineItem.budgetAllocationId.toString());
//   }

//   // ========== VARIANCE ANALYSIS METHODS ==========

//   async calculateVariance(budgetAllocationId: string, organizationId: string, period: string): Promise<BudgetVarianceDocument> {
//     const allocation = await this.budgetAllocationModel.findById(budgetAllocationId);

//     if (!allocation || allocation.organizationId.toString() !== organizationId) {
//       throw new NotFoundException('Budget allocation not found');
//     }

//     const lineItems = await this.budgetLineItemModel.find({
//       budgetAllocationId: new Types.ObjectId(budgetAllocationId),
//       status: { $ne: 'cancelled' },
//     });

//     const budgetedAmount = lineItems
//       .filter(item => item.status === 'planned' || item.status === 'committed')
//       .reduce((sum, item) => sum + item.amount, 0);

//     const actualAmount = lineItems.reduce((sum, item) => sum + item.spent, 0);
//     const variance = budgetedAmount - actualAmount;
//     const variancePercentage = budgetedAmount ? (variance / budgetedAmount) * 100 : 0;

//     const existingVariance = await this.budgetVarianceModel.findOne({
//       budgetAllocationId: new Types.ObjectId(budgetAllocationId),
//       period,
//     });

//     const varianceData = {
//       organizationId: allocation.organizationId,
//       budgetAllocationId: new Types.ObjectId(budgetAllocationId),
//       period,
//       budgetedAmount,
//       actualAmount,
//       variance,
//       variancePercentage,
//       trend: variance >= 0 ? 'favorable' : 'unfavorable',
//     };

//     if (existingVariance) {
//       const result = await this.budgetVarianceModel.findByIdAndUpdate(existingVariance._id, varianceData, { new: true });
//       if (!result) {
//         throw new NotFoundException(`Budget variance with ID ${existingVariance._id} not found`);
//       }
//       return result;
//     }

//     const newVariance = new this.budgetVarianceModel(varianceData);
//     return newVariance.save();
//   }

//   async getVarianceAnalysis(
//     budgetAllocationId: string,
//     organizationId: string,
//     fromPeriod?: string,
//     toPeriod?: string,
//   ): Promise<BudgetVarianceDocument[]> {
//     const query: any = {
//       budgetAllocationId: new Types.ObjectId(budgetAllocationId),
//       organizationId: new Types.ObjectId(organizationId),
//     };

//     if (fromPeriod || toPeriod) {
//       query.period = {};
//       if (fromPeriod) query.period.$gte = fromPeriod;
//       if (toPeriod) query.period.$lte = toPeriod;
//     }

//     return this.budgetVarianceModel.find(query).sort({ period: 1 });
//   }

//   async getBudgetSummary(organizationId: string, fiscalYear?: number): Promise<{
//     totalAllocated: number;
//     totalSpent: number;
//     totalUncommitted: number;
//     allocations: { name: string; allocated: number; spent: number; variance: number }[];
//   }> {
//     const query: any = { organizationId: new Types.ObjectId(organizationId) };
//     if (fiscalYear) query.fiscalYear = fiscalYear;

//     const allocations = await this.budgetAllocationModel.find(query);

//     const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
//     const totalSpent = allocations.reduce((sum, a) => sum + a.spentAmount, 0);
//     const totalUncommitted = allocations.reduce((sum, a) => sum + (a.uncommittedAmount || 0), 0);

//     return {
//       totalAllocated,
//       totalSpent,
//       totalUncommitted,
//       allocations: allocations.map(a => ({
//         name: a.name,
//         allocated: a.allocatedAmount,
//         spent: a.spentAmount,
//         variance: a.allocatedAmount - a.spentAmount,
//       })),
//     };
//   }

//   // ========== HELPER METHODS ==========

//   private async updateUncommittedAmount(budgetAllocationId: string): Promise<void> {
//     const allocation = await this.budgetAllocationModel.findById(budgetAllocationId);
//     if (!allocation) return;

//     const lineItems = await this.budgetLineItemModel.find({
//       budgetAllocationId: new Types.ObjectId(budgetAllocationId),
//       status: { $ne: 'cancelled' },
//     });

//     const committedAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
//     const uncommittedAmount = Math.max(0, allocation.allocatedAmount - committedAmount);

//     await this.budgetAllocationModel.findByIdAndUpdate(budgetAllocationId, { uncommittedAmount });
//   }
// }


import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  BudgetAllocation, BudgetAllocationDocument,
  BudgetLineItem, BudgetLineItemDocument,
  BudgetVariance, BudgetVarianceDocument,
  BudgetAuditEvent, BudgetAuditEventDocument,
  BudgetStatus, LineItemStatus, AlertSeverity, RevisionReason,
} from './schemas/budget.schema';
import {
  CreateBudgetAllocationDto, UpdateBudgetAllocationDto,
  ApproveBudgetDto, ReviseBudgetDto,
  CreateLineItemDto, UpdateLineItemDto,
  CalculateVarianceDto, BudgetQueryDto,
  VarianceQueryDto, BudgetSummaryQueryDto,
} from './dto/budget.dto';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RequestUser {
  _id: string | Types.ObjectId;
  email: string;
  organizationId: string | Types.ObjectId;
  role: string;
}

export interface BudgetSummaryResult {
  totalAllocated: number;
  totalAllocatedUSD: number;
  totalSpent: number;
  totalCommitted: number;
  totalUncommitted: number;
  overallBurnRate: number;
  projectedYearEnd: number;
  alertedBudgets: number;
  allocations: Array<{
    _id: string;
    name: string;
    category: string;
    currency: string;
    allocated: number;
    spent: number;
    committed: number;
    uncommitted: number;
    burnRate: number;
    status: string;
    alertLevel: string;
  }>;
  byCategory: Record<string, { allocated: number; spent: number }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @InjectModel(BudgetAllocation.name)
    private allocationModel: Model<BudgetAllocationDocument>,

    @InjectModel(BudgetLineItem.name)
    private lineItemModel: Model<BudgetLineItemDocument>,

    @InjectModel(BudgetVariance.name)
    private varianceModel: Model<BudgetVarianceDocument>,

    @InjectModel(BudgetAuditEvent.name)
    private auditModel: Model<BudgetAuditEventDocument>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // BUDGET ALLOCATIONS
  // ══════════════════════════════════════════════════════════════════════════

  async createAllocation(
    dto: CreateBudgetAllocationDto,
    user: RequestUser,
  ): Promise<BudgetAllocationDocument> {
    this._validateDateRange(dto.startDate, dto.endDate);

    const allocatedAmountUSD = dto.exchangeRateToUSD
      ? dto.allocatedAmount * dto.exchangeRateToUSD
      : dto.allocatedAmount; // assume USD if no rate provided

    const allocation = await this.allocationModel.create({
      ...dto,
      organizationId: user.organizationId,
      allocatedAmountUSD,
      uncommittedAmount: dto.allocatedAmount,
      currency: dto.currency ?? 'USD',
      status: BudgetStatus.DRAFT,
      createdBy: user._id,
      revisions: [],
      burnRateHistory: [],
      ...(dto.exchangeRateToUSD
        ? {
            exchangeRate: {
              baseCurrency: dto.currency ?? 'USD',
              targetCurrency: 'USD',
              rate: dto.exchangeRateToUSD,
              snapshotDate: new Date(),
            },
          }
        : {}),
    });

    await this._auditLog(user, 'CREATE_ALLOCATION', 'BudgetAllocation', allocation._id as Types.ObjectId);
    return allocation;
  }

  async listAllocations(
    organizationId: string,
    query: BudgetQueryDto,
  ): Promise<{ data: BudgetAllocationDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, any> = {
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    };

    if (query.status) filter.status = query.status;
    if (query.fiscalYear) filter.fiscalYear = query.fiscalYear;
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.grantId) filter.grantId = new Types.ObjectId(query.grantId);
    if (query.category) filter.category = query.category;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.allocationModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      this.allocationModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async getAllocation(id: string, organizationId: string): Promise<BudgetAllocationDocument> {
    const allocation = await this.allocationModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    });
    if (!allocation) throw new NotFoundException('Budget allocation not found');
    return allocation;
  }

  async updateAllocation(
    id: string,
    dto: UpdateBudgetAllocationDto,
    user: RequestUser,
  ): Promise<BudgetAllocationDocument> {
    const allocation = await this.getAllocation(id, String(user.organizationId));

    if (allocation.status === BudgetStatus.CLOSED || allocation.status === BudgetStatus.ARCHIVED) {
      throw new ForbiddenException('Cannot update a closed or archived budget');
    }

    if (dto.startDate || dto.endDate) {
      this._validateDateRange(
        dto.startDate ?? allocation.startDate.toISOString(),
        dto.endDate ?? allocation.endDate.toISOString(),
      );
    }

    const before = allocation.toObject();
    Object.assign(allocation, { ...dto, lastModifiedBy: user._id });
    await allocation.save();

    await this._auditLog(user, 'UPDATE_ALLOCATION', 'BudgetAllocation', allocation._id as Types.ObjectId, before, allocation.toObject());
    return allocation;
  }

  async approveAllocation(
    id: string,
    dto: ApproveBudgetDto,
    user: RequestUser,
  ): Promise<BudgetAllocationDocument> {
    const allocation = await this.getAllocation(id, String(user.organizationId));

    if (allocation.status !== BudgetStatus.DRAFT && allocation.status !== BudgetStatus.SUBMITTED) {
      throw new BadRequestException(`Cannot approve a budget in status: ${allocation.status}`);
    }

    allocation.status = BudgetStatus.APPROVED;
    allocation.approvedBy = new Types.ObjectId(dto.approverUserId);
    allocation.approvalDate = new Date();
    allocation.approvalNotes = dto.notes;
    allocation.lastModifiedBy = new Types.ObjectId(String(user._id));
    await allocation.save();

    await this._auditLog(user, 'APPROVE_ALLOCATION', 'BudgetAllocation', allocation._id as Types.ObjectId, undefined, undefined, dto.notes);
    return allocation;
  }

  /**
   * Revise a budget — records full revision history before changing amount.
   * This is the premium feature that basic systems lack: donor-amendment audit trail.
   */
  async reviseAllocation(
    id: string,
    dto: ReviseBudgetDto,
    user: RequestUser,
  ): Promise<BudgetAllocationDocument> {
    const allocation = await this.getAllocation(id, String(user.organizationId));

    if (allocation.status === BudgetStatus.CLOSED || allocation.status === BudgetStatus.ARCHIVED) {
      throw new ForbiddenException('Cannot revise a closed or archived budget');
    }
    if (dto.newAllocatedAmount < allocation.spentAmount) {
      throw new BadRequestException(
        `New amount (${dto.newAllocatedAmount}) cannot be less than amount already spent (${allocation.spentAmount})`,
      );
    }

    const newRevisionNumber = (allocation.currentRevisionNumber ?? 0) + 1;

    allocation.revisions.push({
      revisedAt: new Date(),
      revisedBy: new Types.ObjectId(String(user._id)),
      previousAmount: allocation.allocatedAmount,
      newAmount: dto.newAllocatedAmount,
      reason: dto.reason,
      notes: dto.notes,
      revisionNumber: newRevisionNumber,
    });

    allocation.currentRevisionNumber = newRevisionNumber;
    allocation.allocatedAmount = dto.newAllocatedAmount;
    allocation.uncommittedAmount = dto.newAllocatedAmount - allocation.committedAmount;
    allocation.lastModifiedBy = new Types.ObjectId(String(user._id));
    await allocation.save();

    await this._auditLog(user, 'REVISE_ALLOCATION', 'BudgetAllocation', allocation._id as Types.ObjectId, undefined, undefined, dto.notes);
    return allocation;
  }

  async closeAllocation(id: string, user: RequestUser): Promise<BudgetAllocationDocument> {
    const allocation = await this.getAllocation(id, String(user.organizationId));
    if (allocation.status !== BudgetStatus.ACTIVE) {
      throw new BadRequestException('Only active budgets can be closed');
    }
    allocation.status = BudgetStatus.CLOSED;
    allocation.closedAt = new Date();
    allocation.lastModifiedBy = new Types.ObjectId(String(user._id));
    await allocation.save();
    await this._auditLog(user, 'CLOSE_ALLOCATION', 'BudgetAllocation', allocation._id as Types.ObjectId);
    return allocation;
  }

  async deleteAllocation(id: string, user: RequestUser): Promise<void> {
    const allocation = await this.getAllocation(id, String(user.organizationId));
    if (allocation.status !== BudgetStatus.DRAFT) {
      throw new ForbiddenException('Only draft budgets can be deleted');
    }
    allocation.isDeleted = true;
    allocation.lastModifiedBy = new Types.ObjectId(String(user._id));
    await allocation.save();
    await this._auditLog(user, 'DELETE_ALLOCATION', 'BudgetAllocation', allocation._id as Types.ObjectId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LINE ITEMS
  // ══════════════════════════════════════════════════════════════════════════

  async createLineItem(
    dto: CreateLineItemDto,
    user: RequestUser,
  ): Promise<BudgetLineItemDocument> {
    const allocation = await this.getAllocation(dto.budgetAllocationId, String(user.organizationId));

    // Validate expense category restriction
    if (
      allocation.allowedExpenseTypes.length > 0 &&
      !allocation.allowedExpenseTypes.includes(dto.costCategory)
    ) {
      throw new BadRequestException(
        `Cost category '${dto.costCategory}' is not allowed on this budget. ` +
        `Allowed: ${allocation.allowedExpenseTypes.join(', ')}`,
      );
    }

    const amount = dto.quantity * dto.unitCost;

    // Check uncommitted headroom
    if (amount > allocation.uncommittedAmount) {
      throw new BadRequestException(
        `Line item amount (${amount}) exceeds uncommitted budget (${allocation.uncommittedAmount})`,
      );
    }

    const lineItem = await this.lineItemModel.create({
      ...dto,
      amount,
      organizationId: user.organizationId,
      createdBy: user._id,
    });

    // Update parent allocation's committed + uncommitted amounts
    await this.allocationModel.findByIdAndUpdate(dto.budgetAllocationId, {
      $inc: { committedAmount: amount, uncommittedAmount: -amount },
    });

    await this._auditLog(user, 'CREATE_LINE_ITEM', 'BudgetLineItem', lineItem._id as Types.ObjectId);
    return lineItem;
  }

  async getLineItemsByAllocation(allocationId: string, organizationId: string): Promise<BudgetLineItemDocument[]> {
    return this.lineItemModel.find({
      budgetAllocationId: new Types.ObjectId(allocationId),
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    }).sort({ costCategory: 1, createdAt: 1 });
  }

  async updateLineItem(
    id: string,
    dto: UpdateLineItemDto,
    user: RequestUser,
  ): Promise<BudgetLineItemDocument> {
    const lineItem = await this.lineItemModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!lineItem) throw new NotFoundException('Line item not found');

    const before = lineItem.toObject();
    const prevSpent = lineItem.spent;

    Object.assign(lineItem, { ...dto, lastModifiedBy: user._id });
    await lineItem.save();

    // Propagate spent amount change up to the parent allocation
    if (dto.spent !== undefined && dto.spent !== prevSpent) {
      const spentDelta = dto.spent - prevSpent;
      await this.allocationModel.findByIdAndUpdate(lineItem.budgetAllocationId, {
        $inc: { spentAmount: spentDelta },
      });
    }

    await this._auditLog(user, 'UPDATE_LINE_ITEM', 'BudgetLineItem', lineItem._id as Types.ObjectId, before, lineItem.toObject());
    return lineItem;
  }

  async deleteLineItem(id: string, user: RequestUser): Promise<void> {
    const lineItem = await this.lineItemModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!lineItem) throw new NotFoundException('Line item not found');

    // Return committed amount to parent allocation
    await this.allocationModel.findByIdAndUpdate(lineItem.budgetAllocationId, {
      $inc: { committedAmount: -lineItem.amount, uncommittedAmount: lineItem.amount },
    });

    lineItem.isDeleted = true;
    lineItem.lastModifiedBy = new Types.ObjectId(String(user._id));
    await lineItem.save();
    await this._auditLog(user, 'DELETE_LINE_ITEM', 'BudgetLineItem', lineItem._id as Types.ObjectId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANCE & BURN RATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calculates variance for a given period and stores a burn-rate snapshot.
   * Automatically determines alert level and persists it.
   */
  async calculateVariance(
    allocationId: string,
    dto: CalculateVarianceDto,
    user: RequestUser,
  ): Promise<BudgetVarianceDocument> {
    const allocation = await this.getAllocation(allocationId, String(user.organizationId));
    this._validatePeriodFormat(dto.period);

    // Sum line items whose paymentDate falls in the period
    const [year, month] = dto.period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const lineItems = await this.lineItemModel.find({
      budgetAllocationId: new Types.ObjectId(allocationId),
      organizationId: user.organizationId,
      isDeleted: false,
      status: { $in: [LineItemStatus.SPENT, LineItemStatus.COMMITTED] },
    });

    // Compute how much of the total budget is attributable to this period
    const totalMonths = this._monthsBetween(allocation.startDate, allocation.endDate) || 1;
    const budgetedForPeriod = allocation.allocatedAmount / totalMonths;

    const actualForPeriod = lineItems.reduce((sum, li) => {
      if (li.paymentDate && li.paymentDate >= periodStart && li.paymentDate <= periodEnd) {
        return sum + li.spent;
      }
      return sum;
    }, 0);

    const variance = budgetedForPeriod - actualForPeriod;
    const variancePercentage = budgetedForPeriod > 0
      ? (variance / budgetedForPeriod) * 100
      : 0;

    const burnRate = budgetedForPeriod > 0
      ? (actualForPeriod / budgetedForPeriod) * 100
      : 0;

    // Project year-end based on current burn rate
    const elapsedMonths = this._monthsBetween(allocation.startDate, new Date()) || 1;
    const projectedYearEnd = elapsedMonths > 0
      ? (allocation.spentAmount / elapsedMonths) * totalMonths
      : allocation.spentAmount;

    const trend =
      variancePercentage >= 5 ? 'favorable'
      : variancePercentage <= -5 ? 'unfavorable'
      : 'on_track';

    // Alert level based on spend % vs thresholds
    const spendPercent = allocation.allocatedAmount > 0
      ? (allocation.spentAmount / allocation.allocatedAmount) * 100
      : 0;

    const thresholds = allocation.alertThresholds;
    const alertLevel =
      thresholds && spendPercent >= thresholds.criticalPercent ? AlertSeverity.CRITICAL
      : thresholds && spendPercent >= thresholds.warningPercent ? AlertSeverity.WARNING
      : AlertSeverity.INFO;

    // Upsert variance record for this period
    const varianceRecord = await this.varianceModel.findOneAndUpdate(
      {
        budgetAllocationId: new Types.ObjectId(allocationId),
        organizationId: user.organizationId,
        period: dto.period,
      },
      {
        $set: {
          budgetedAmount: budgetedForPeriod,
          actualAmount: actualForPeriod,
          variance,
          variancePercentage,
          burnRate,
          projectedYearEnd,
          trend,
          alertLevel,
          notes: dto.notes,
          calculatedBy: user._id,
        },
      },
      { upsert: true, new: true },
    );

    // Store burn rate snapshot on allocation
    const snapshotEntry = {
      period: dto.period,
      spent: actualForPeriod,
      budgeted: budgetedForPeriod,
      burnRate,
      projectedTotal: projectedYearEnd,
      calculatedAt: new Date(),
    };
    await this.allocationModel.findByIdAndUpdate(allocationId, {
      $push: { burnRateHistory: snapshotEntry },
    });

    await this._auditLog(user, 'CALCULATE_VARIANCE', 'BudgetVariance', varianceRecord._id as Types.ObjectId);
    return varianceRecord;
  }

  async getVarianceAnalysis(
    allocationId: string,
    organizationId: string,
    query: VarianceQueryDto,
  ): Promise<BudgetVarianceDocument[]> {
    const filter: Record<string, any> = {
      budgetAllocationId: new Types.ObjectId(allocationId),
      organizationId: new Types.ObjectId(organizationId),
    };

    if (query.fromPeriod || query.toPeriod) {
      filter.period = {};
      if (query.fromPeriod) filter.period.$gte = query.fromPeriod;
      if (query.toPeriod) filter.period.$lte = query.toPeriod;
    }

    return this.varianceModel.find(filter).sort({ period: 1 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY & ANALYTICS
  // ══════════════════════════════════════════════════════════════════════════

  async getSummary(
    organizationId: string,
    query: BudgetSummaryQueryDto,
  ): Promise<BudgetSummaryResult> {
    const filter: Record<string, any> = {
      organizationId: new Types.ObjectId(organizationId),
      isDeleted: false,
    };
    if (query.fiscalYear) filter.fiscalYear = query.fiscalYear;
    if (query.grantId) filter.grantId = new Types.ObjectId(query.grantId);

    const allocations = await this.allocationModel.find(filter);

    const totals = allocations.reduce(
      (acc, a) => {
        acc.totalAllocated += a.allocatedAmount;
        acc.totalAllocatedUSD += a.allocatedAmountUSD ?? a.allocatedAmount;
        acc.totalSpent += a.spentAmount;
        acc.totalCommitted += a.committedAmount;
        acc.totalUncommitted += a.uncommittedAmount;
        return acc;
      },
      { totalAllocated: 0, totalAllocatedUSD: 0, totalSpent: 0, totalCommitted: 0, totalUncommitted: 0 },
    );

    // Get latest variance for each allocation for burn rate
    const varianceList = await this.varianceModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId) } },
      { $sort: { period: -1 } },
      { $group: { _id: '$budgetAllocationId', latest: { $first: '$$ROOT' } } },
    ]);
    const varianceMap = new Map(varianceList.map((v) => [String(v._id), v.latest]));

    const byCategory: Record<string, { allocated: number; spent: number }> = {};
    let alertedBudgets = 0;

    const allocationSummaries = allocations.map((a) => {
      const latest = varianceMap.get(String(a._id));
      const burnRate = latest?.burnRate ?? (a.allocatedAmount > 0 ? (a.spentAmount / a.allocatedAmount) * 100 : 0);
      const alertLevel = latest?.alertLevel ?? AlertSeverity.INFO;

      if (alertLevel !== AlertSeverity.INFO) alertedBudgets++;

      const cat = a.category;
      if (!byCategory[cat]) byCategory[cat] = { allocated: 0, spent: 0 };
      byCategory[cat].allocated += a.allocatedAmount;
      byCategory[cat].spent += a.spentAmount;

      return {
        _id: String(a._id),
        name: a.name,
        category: a.category,
        currency: a.currency,
        allocated: a.allocatedAmount,
        spent: a.spentAmount,
        committed: a.committedAmount,
        uncommitted: a.uncommittedAmount,
        burnRate,
        status: a.status,
        alertLevel,
      };
    });

    const overallBurnRate = totals.totalAllocated > 0
      ? (totals.totalSpent / totals.totalAllocated) * 100
      : 0;

    const projectedYearEnd = varianceList.reduce((sum, v) => sum + (v.latest?.projectedYearEnd ?? 0), 0);

    return {
      ...totals,
      overallBurnRate,
      projectedYearEnd,
      alertedBudgets,
      allocations: allocationSummaries,
      byCategory,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ══════════════════════════════════════════════════════════════════════════

  async getAuditLog(entityId: string, organizationId: string): Promise<BudgetAuditEventDocument[]> {
    return this.auditModel.find({
      entityId: new Types.ObjectId(entityId),
      organizationId: new Types.ObjectId(organizationId),
    }).sort({ createdAt: -1 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async _auditLog(
    user: RequestUser,
    action: string,
    entity: string,
    entityId: Types.ObjectId,
    before?: Record<string, any>,
    after?: Record<string, any>,
    reason?: string,
  ): Promise<void> {
    try {
      await this.auditModel.create({
        organizationId: user.organizationId,
        userId: user._id,
        userEmail: user.email,
        action,
        entity,
        entityId,
        before,
        after,
        reason,
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err}`);
    }
  }

  private _validateDateRange(startDate: string, endDate: string): void {
    if (new Date(endDate) <= new Date(startDate)) {
      throw new BadRequestException('End date must be after start date');
    }
  }

  private _validatePeriodFormat(period: string): void {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('Period must be in YYYY-MM format');
    }
  }

  private _monthsBetween(start: Date, end: Date): number {
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) + 1
    );
  }
}