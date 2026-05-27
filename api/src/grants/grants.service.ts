import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Grant, GrantDocument } from './schemas/grant.schema';
import { CreateGrantDto } from './dto/create-grant.dto';
import { UpdateGrantDto } from './dto/update-grant.dto';

@Injectable()
export class GrantsService {
  constructor(@InjectModel(Grant.name) private grantModel: Model<GrantDocument>) {}

  async create(organizationId: string, createGrantDto: CreateGrantDto): Promise<GrantDocument> {
    const grant = new this.grantModel({
      ...createGrantDto,
      organizationId: new Types.ObjectId(organizationId),
      donorId: createGrantDto.donorId ? new Types.ObjectId(createGrantDto.donorId) : undefined,
      linkedProjects: createGrantDto.linkedProjects?.map(id => new Types.ObjectId(id)),
    });
    return grant.save();
  }

  async findAll(organizationId: string, filters?: {
    status?: string;
    donorId?: string;
    search?: string;
  }): Promise<GrantDocument[]> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.donorId) {
      query.donorId = new Types.ObjectId(filters.donorId);
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return this.grantModel.find(query).sort({ createdAt: -1 }).populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy']);
  }

  async findOne(id: string, organizationId: string): Promise<GrantDocument> {
    const grant = await this.grantModel
      .findById(id)
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .exec();

    if (!grant) {
      throw new NotFoundException('Grant not found');
    }

    if (grant.organizationId.toString() !== organizationId) {
      throw new ForbiddenException('Access denied');
    }

    return grant;
  }

  async update(id: string, organizationId: string, updateGrantDto: UpdateGrantDto): Promise<GrantDocument> {
    const grant = await this.findOne(id, organizationId);

    const updateData: Record<string, any> = {
      ...updateGrantDto,
      donorId: updateGrantDto.donorId ? new Types.ObjectId(updateGrantDto.donorId) : undefined,
      linkedProjects: updateGrantDto.linkedProjects?.map(pid => new Types.ObjectId(pid)),
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await this.grantModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .exec();

    if (!updated) {
      throw new NotFoundException('Grant not found');
    }

    return updated;
  }

  async remove(id: string, organizationId: string): Promise<GrantDocument> {
    const grant = await this.findOne(id, organizationId);

    const deleted = await this.grantModel.findByIdAndDelete(id).exec();

    if (!deleted) {
      throw new NotFoundException('Grant not found');
    }

    return deleted;
  }

  async getBudgetSummary(organizationId: string): Promise<{
    totalGrantAmount: number;
    totalSpent: number;
    remainingBudget: number;
    activeGrants: number;
  }> {
    const grants = await this.findAll(organizationId, { status: 'active' });

    const totalGrantAmount = grants.reduce((sum, g) => sum + (g.amount || 0), 0);
    const totalSpent = grants.reduce((sum, g) => sum + (g.amountSpent || 0), 0);

    return {
      totalGrantAmount,
      totalSpent,
      remainingBudget: totalGrantAmount - totalSpent,
      activeGrants: grants.length,
    };
  }

  async updateGrantSpending(id: string, organizationId: string, amountSpent: number): Promise<GrantDocument> {
    const grant = await this.findOne(id, organizationId);

    if (amountSpent > grant.amount) {
      throw new ForbiddenException('Spending amount cannot exceed grant amount');
    }

    return this.update(id, organizationId, { amountSpent });
  }

  async getGrantsByProject(organizationId: string, projectId: string): Promise<GrantDocument[]> {
    const objProjectId = new Types.ObjectId(projectId);
    return this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        linkedProjects: objProjectId,
      })
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .sort({ createdAt: -1 });
  }

  async getExpiringGrants(organizationId: string, daysUntilExpiry: number = 30): Promise<GrantDocument[]> {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);

    return this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        endDate: { $gte: now, $lte: expiryDate },
        status: { $ne: 'closed' },
      })
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .sort({ endDate: 1 });
  }
}
