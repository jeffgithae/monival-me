import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BudgetAllocation, BudgetAllocationDocument } from './schemas/budget-allocation.schema';
import { BudgetLineItem, BudgetLineItemDocument } from './schemas/budget-line-item.schema';
import { BudgetVariance, BudgetVarianceDocument } from './schemas/budget-variance.schema';
import { CreateBudgetAllocationDto, UpdateBudgetAllocationDto } from './dto/budget.dto';
import { CreateBudgetLineItemDto, UpdateBudgetLineItemDto } from './dto/budget-line-item.dto';

@Injectable()
export class BudgetService {
  constructor(
    @InjectModel(BudgetAllocation.name) private budgetAllocationModel: Model<BudgetAllocationDocument>,
    @InjectModel(BudgetLineItem.name) private budgetLineItemModel: Model<BudgetLineItemDocument>,
    @InjectModel(BudgetVariance.name) private budgetVarianceModel: Model<BudgetVarianceDocument>,
  ) {}

  // ========== BUDGET ALLOCATION METHODS ==========

  async createBudgetAllocation(
    organizationId: string,
    createDto: CreateBudgetAllocationDto,
  ): Promise<BudgetAllocationDocument> {
    const allocation = new this.budgetAllocationModel({
      ...createDto,
      organizationId: new Types.ObjectId(organizationId),
      projectId: createDto.projectId ? new Types.ObjectId(createDto.projectId) : undefined,
      uncommittedAmount: createDto.allocatedAmount,
    });
    return allocation.save();
  }

  async getBudgetAllocations(organizationId: string, filters?: {
    status?: string;
    fiscalYear?: number;
    projectId?: string;
  }): Promise<BudgetAllocationDocument[]> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.status) query.status = filters.status;
    if (filters?.fiscalYear) query.fiscalYear = filters.fiscalYear;
    if (filters?.projectId) query.projectId = new Types.ObjectId(filters.projectId);

    return this.budgetAllocationModel
      .find(query)
      .sort({ fiscalYear: -1, createdAt: -1 })
      .populate(['projectId', 'createdBy', 'approvedBy']);
  }

  async getBudgetAllocation(id: string, organizationId: string): Promise<BudgetAllocationDocument> {
    const allocation = await this.budgetAllocationModel
      .findById(id)
      .populate(['projectId', 'createdBy', 'approvedBy']);

    if (!allocation || allocation.organizationId.toString() !== organizationId) {
      throw new NotFoundException('Budget allocation not found');
    }

    return allocation;
  }

  async updateBudgetAllocation(
    id: string,
    organizationId: string,
    updateDto: UpdateBudgetAllocationDto,
  ): Promise<BudgetAllocationDocument> {
    const allocation = await this.getBudgetAllocation(id, organizationId);

    const updateData: Record<string, any> = { ...updateDto };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await this.budgetAllocationModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate(['projectId', 'createdBy', 'approvedBy']);

    if (!updated) throw new NotFoundException('Budget allocation not found');
    return updated;
  }

  async approveBudget(id: string, organizationId: string, approverUserId: string): Promise<BudgetAllocationDocument> {
    const allocation = await this.getBudgetAllocation(id, organizationId);

    if (allocation.status !== 'draft') {
      throw new ForbiddenException('Only draft budgets can be approved');
    }

    const updated = await this.budgetAllocationModel
      .findByIdAndUpdate(
        id,
        {
          status: 'approved',
          approvedBy: new Types.ObjectId(approverUserId),
          approvalDate: new Date(),
        },
        { new: true },
      )
      .populate(['projectId', 'createdBy', 'approvedBy']);

    if (!updated) {
      throw new NotFoundException('Budget allocation not found');
    }

    return updated;
  }

  async deleteBudgetAllocation(id: string, organizationId: string): Promise<void> {
    const allocation = await this.getBudgetAllocation(id, organizationId);

    if (allocation.status === 'active' || allocation.status === 'closed') {
      throw new ForbiddenException('Cannot delete active or closed budgets');
    }

    await this.budgetAllocationModel.findByIdAndDelete(id);
    await this.budgetLineItemModel.deleteMany({ budgetAllocationId: new Types.ObjectId(id) });
    await this.budgetVarianceModel.deleteMany({ budgetAllocationId: new Types.ObjectId(id) });
  }

  // ========== BUDGET LINE ITEM METHODS ==========

  async createLineItem(
    organizationId: string,
    createDto: CreateBudgetLineItemDto,
  ): Promise<BudgetLineItemDocument> {
    const allocation = await this.getBudgetAllocation(createDto.budgetAllocationId, organizationId);

    if (createDto.amount > allocation.allocatedAmount) {
      throw new ForbiddenException('Line item amount exceeds budget allocation');
    }

    const lineItem = new this.budgetLineItemModel({
      ...createDto,
      organizationId: new Types.ObjectId(organizationId),
      budgetAllocationId: new Types.ObjectId(createDto.budgetAllocationId),
      linkedActivity: createDto.linkedActivity ? new Types.ObjectId(createDto.linkedActivity) : undefined,
    });

    const saved = await lineItem.save();

    // Update uncommitted amount
    await this.updateUncommittedAmount(createDto.budgetAllocationId);

    return saved;
  }

  async getLineItems(organizationId: string, budgetAllocationId: string): Promise<BudgetLineItemDocument[]> {
    return this.budgetLineItemModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        budgetAllocationId: new Types.ObjectId(budgetAllocationId),
      })
      .populate('linkedActivity');
  }

  async updateLineItem(
    id: string,
    organizationId: string,
    updateDto: UpdateBudgetLineItemDto,
  ): Promise<BudgetLineItemDocument> {
    const lineItem = await this.budgetLineItemModel.findById(id);

    if (!lineItem || lineItem.organizationId.toString() !== organizationId) {
      throw new NotFoundException('Line item not found');
    }

    const updated = await this.budgetLineItemModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .populate('linkedActivity');

    if (!updated) {
      throw new NotFoundException('Line item not found');
    }

    await this.updateUncommittedAmount(lineItem.budgetAllocationId.toString());

    return updated;
  }

  async deleteLineItem(id: string, organizationId: string): Promise<void> {
    const lineItem = await this.budgetLineItemModel.findById(id);

    if (!lineItem || lineItem.organizationId.toString() !== organizationId) {
      throw new NotFoundException('Line item not found');
    }

    await this.budgetLineItemModel.findByIdAndDelete(id);
    await this.updateUncommittedAmount(lineItem.budgetAllocationId.toString());
  }

  // ========== VARIANCE ANALYSIS METHODS ==========

  async calculateVariance(budgetAllocationId: string, organizationId: string, period: string): Promise<BudgetVarianceDocument> {
    const allocation = await this.budgetAllocationModel.findById(budgetAllocationId);

    if (!allocation || allocation.organizationId.toString() !== organizationId) {
      throw new NotFoundException('Budget allocation not found');
    }

    const lineItems = await this.budgetLineItemModel.find({
      budgetAllocationId: new Types.ObjectId(budgetAllocationId),
      status: { $ne: 'cancelled' },
    });

    const budgetedAmount = lineItems
      .filter(item => item.status === 'planned' || item.status === 'committed')
      .reduce((sum, item) => sum + item.amount, 0);

    const actualAmount = lineItems.reduce((sum, item) => sum + item.spent, 0);
    const variance = budgetedAmount - actualAmount;
    const variancePercentage = budgetedAmount ? (variance / budgetedAmount) * 100 : 0;

    const existingVariance = await this.budgetVarianceModel.findOne({
      budgetAllocationId: new Types.ObjectId(budgetAllocationId),
      period,
    });

    const varianceData = {
      organizationId: allocation.organizationId,
      budgetAllocationId: new Types.ObjectId(budgetAllocationId),
      period,
      budgetedAmount,
      actualAmount,
      variance,
      variancePercentage,
      trend: variance >= 0 ? 'favorable' : 'unfavorable',
    };

    if (existingVariance) {
      const result = await this.budgetVarianceModel.findByIdAndUpdate(existingVariance._id, varianceData, { new: true });
      if (!result) {
        throw new NotFoundException(`Budget variance with ID ${existingVariance._id} not found`);
      }
      return result;
    }

    const newVariance = new this.budgetVarianceModel(varianceData);
    return newVariance.save();
  }

  async getVarianceAnalysis(
    budgetAllocationId: string,
    organizationId: string,
    fromPeriod?: string,
    toPeriod?: string,
  ): Promise<BudgetVarianceDocument[]> {
    const query: any = {
      budgetAllocationId: new Types.ObjectId(budgetAllocationId),
      organizationId: new Types.ObjectId(organizationId),
    };

    if (fromPeriod || toPeriod) {
      query.period = {};
      if (fromPeriod) query.period.$gte = fromPeriod;
      if (toPeriod) query.period.$lte = toPeriod;
    }

    return this.budgetVarianceModel.find(query).sort({ period: 1 });
  }

  async getBudgetSummary(organizationId: string, fiscalYear?: number): Promise<{
    totalAllocated: number;
    totalSpent: number;
    totalUncommitted: number;
    allocations: { name: string; allocated: number; spent: number; variance: number }[];
  }> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };
    if (fiscalYear) query.fiscalYear = fiscalYear;

    const allocations = await this.budgetAllocationModel.find(query);

    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    const totalSpent = allocations.reduce((sum, a) => sum + a.spentAmount, 0);
    const totalUncommitted = allocations.reduce((sum, a) => sum + (a.uncommittedAmount || 0), 0);

    return {
      totalAllocated,
      totalSpent,
      totalUncommitted,
      allocations: allocations.map(a => ({
        name: a.name,
        allocated: a.allocatedAmount,
        spent: a.spentAmount,
        variance: a.allocatedAmount - a.spentAmount,
      })),
    };
  }

  // ========== HELPER METHODS ==========

  private async updateUncommittedAmount(budgetAllocationId: string): Promise<void> {
    const allocation = await this.budgetAllocationModel.findById(budgetAllocationId);
    if (!allocation) return;

    const lineItems = await this.budgetLineItemModel.find({
      budgetAllocationId: new Types.ObjectId(budgetAllocationId),
      status: { $ne: 'cancelled' },
    });

    const committedAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const uncommittedAmount = Math.max(0, allocation.allocatedAmount - committedAmount);

    await this.budgetAllocationModel.findByIdAndUpdate(budgetAllocationId, { uncommittedAmount });
  }
}
