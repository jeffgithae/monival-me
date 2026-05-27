import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OKR, OKRDocument } from './schemas/okr.schema';
import { CreateOKRDto, UpdateOKRDto, UpdateKeyResultDto } from './dto/okr.dto';

@Injectable()
export class OKRService {
  constructor(@InjectModel(OKR.name) private okrModel: Model<OKRDocument>) {}

  async create(organizationId: string, createDto: CreateOKRDto): Promise<OKRDocument> {
    const okr = new this.okrModel({
      ...createDto,
      organizationId: new Types.ObjectId(organizationId),
      ownerUserId: createDto.ownerUserId ? new Types.ObjectId(createDto.ownerUserId) : undefined,
      linkedProjects: createDto.linkedProjects?.map(id => new Types.ObjectId(id)),
    });

    const saved = await okr.save();
    await this.updateProgress(saved._id.toString());
    return saved.populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects']);
  }

  async findAll(organizationId: string, filters?: {
    status?: string;
    quarter?: number;
    year?: number;
    ownerUserId?: string;
  }): Promise<OKRDocument[]> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.status) query.status = filters.status;
    if (filters?.quarter) query.quarter = filters.quarter;
    if (filters?.year) query.year = filters.year;
    if (filters?.ownerUserId) query.ownerUserId = new Types.ObjectId(filters.ownerUserId);

    return this.okrModel
      .find(query)
      .sort({ year: -1, quarter: -1, createdAt: -1 })
      .populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects']);
  }

  async findOne(id: string, organizationId: string): Promise<OKRDocument> {
    const okr = await this.okrModel
      .findById(id)
      .populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects']);

    if (!okr || okr.organizationId.toString() !== organizationId) {
      throw new NotFoundException('OKR not found');
    }

    return okr;
  }

  async update(id: string, organizationId: string, updateDto: UpdateOKRDto): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    const updateData: any = { ...updateDto };
    if (updateDto.ownerUserId) updateData.ownerUserId = new Types.ObjectId(updateDto.ownerUserId);
    if (updateDto.linkedProjects) updateData.linkedProjects = updateDto.linkedProjects.map(id => new Types.ObjectId(id));

    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await this.okrModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects']);

    if (!updated) {
      throw new NotFoundException('OKR not found');
    }

    await this.updateProgress(id);

    return updated;
  }

  async updateKeyResult(
    id: string,
    krIndex: number,
    organizationId: string,
    updateDto: UpdateKeyResultDto,
  ): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    if (!okr.keyResults[krIndex]) {
      throw new NotFoundException('Key Result not found');
    }

    const kr = okr.keyResults[krIndex];
    if (updateDto.title) kr.title = updateDto.title;
    if (updateDto.currentValue !== undefined) kr.currentValue = updateDto.currentValue;
    if (updateDto.confidence !== undefined) kr.confidence = updateDto.confidence;
    if (updateDto.status) kr.status = updateDto.status;
    if (updateDto.notes) kr.notes = updateDto.notes;

    const updated = await this.okrModel
      .findByIdAndUpdate(id, { keyResults: okr.keyResults }, { new: true })
      .populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects']);

    if (!updated) {
      throw new NotFoundException('OKR not found');
    }

    await this.updateProgress(id);

    return updated;
  }

  async delete(id: string, organizationId: string): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    if (okr.status === 'active') {
      throw new ForbiddenException('Cannot delete active OKRs');
    }

    const deleted = await this.okrModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('OKR not found');
    }
    return deleted;
  }

  async markAsReviewed(id: string, organizationId: string, reviewerUserId: string): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    const updated = await this.okrModel
      .findByIdAndUpdate(
        id,
        {
          reviewedBy: new Types.ObjectId(reviewerUserId),
          reviewDate: new Date(),
        },
        { new: true },
      )
      .populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects']);

    if (!updated) {
      throw new NotFoundException('OKR not found');
    }

    return updated;
  }

  async getProgress(id: string, organizationId: string): Promise<{
    overallProgress: number;
    keyResults: Array<{
      title: string;
      targetValue: number;
      currentValue: number;
      progress: number;
      confidence: number;
      status: string;
    }>;
  }> {
    const okr = await this.findOne(id, organizationId);

    const keyResults = okr.keyResults.map(kr => ({
      title: kr.title,
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
      progress: Math.min(100, (kr.currentValue / kr.targetValue) * 100),
      confidence: kr.confidence,
      status: kr.status,
    }));

    const overallProgress = keyResults.length
      ? Math.round(keyResults.reduce((sum, kr) => sum + kr.progress, 0) / keyResults.length)
      : 0;

    return {
      overallProgress,
      keyResults,
    };
  }

  async getQuarterlyOKRs(organizationId: string, year: number, quarter: number): Promise<OKRDocument[]> {
    return this.okrModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        year,
        quarter,
      })
      .populate(['ownerUserId', 'createdBy', 'reviewedBy', 'linkedProjects'])
      .sort({ createdAt: -1 });
  }

  // ========== PRIVATE METHODS ==========

  private async updateProgress(okrId: string | Types.ObjectId): Promise<void> {
    const okr = await this.okrModel.findById(okrId);
    if (!okr) return;

    const keyResults = okr.keyResults || [];
    let progressPercentage = 0;

    if (keyResults.length > 0) {
      const totalProgress = keyResults.reduce((sum, kr) => {
        return sum + Math.min(100, (kr.currentValue / kr.targetValue) * 100);
      }, 0);
      progressPercentage = Math.round(totalProgress / keyResults.length);
    }

    await this.okrModel.findByIdAndUpdate(okrId, { progressPercentage });
  }
}
