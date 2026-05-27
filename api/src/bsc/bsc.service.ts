import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BalancedScorecard, BalancedScorecardDocument } from './schemas/balanced-scorecard.schema';
import { CreateBalancedScorecardDto, UpdateBalancedScorecardDto, UpdateObjectiveDto } from './dto/balanced-scorecard.dto';

@Injectable()
export class BalancedScorecardService {
  constructor(@InjectModel(BalancedScorecard.name) private bscModel: Model<BalancedScorecardDocument>) {}

  async create(organizationId: string, createDto: CreateBalancedScorecardDto): Promise<BalancedScorecardDocument> {
    const bsc = new this.bscModel({
      ...createDto,
      organizationId: new Types.ObjectId(organizationId),
    });
    return bsc.save();
  }

  async findAll(organizationId: string, filters?: {
    fiscalYear?: number;
    status?: string;
  }): Promise<BalancedScorecardDocument[]> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.fiscalYear) query.fiscalYear = filters.fiscalYear;
    if (filters?.status) query.status = filters.status;

    return this.bscModel
      .find(query)
      .sort({ fiscalYear: -1 })
      .populate(['createdBy', 'lastReviewedBy']);
  }

  async findOne(id: string, organizationId: string): Promise<BalancedScorecardDocument> {
    const bsc = await this.bscModel.findById(id).populate(['createdBy', 'lastReviewedBy']);

    if (!bsc || bsc.organizationId.toString() !== organizationId) {
      throw new NotFoundException('Balanced Scorecard not found');
    }

    return bsc;
  }

  async update(
    id: string,
    organizationId: string,
    updateDto: UpdateBalancedScorecardDto,
  ): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);

    const updateData: Record<string, any> = { ...updateDto };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await this.bscModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate(['createdBy', 'lastReviewedBy']);

    if (!updated) throw new NotFoundException('Balanced Scorecard not found');
    return updated;
  }

  async updateObjective(
    id: string,
    perspectiveIndex: number,
    objectiveIndex: number,
    organizationId: string,
    updateDto: UpdateObjectiveDto,
  ): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);

    if (!bsc.perspectives[perspectiveIndex] || !bsc.perspectives[perspectiveIndex].objectives[objectiveIndex]) {
      throw new NotFoundException('Objective not found');
    }

    const objective = bsc.perspectives[perspectiveIndex].objectives[objectiveIndex];
    if (updateDto.title) objective.title = updateDto.title;
    if (updateDto.current !== undefined) objective.current = updateDto.current;
    if (updateDto.status) objective.status = updateDto.status;

    const updated = await this.bscModel
      .findByIdAndUpdate(id, { perspectives: bsc.perspectives }, { new: true })
      .populate(['createdBy', 'lastReviewedBy']);

    if (!updated) throw new NotFoundException('Balanced Scorecard not found');
    return updated;
  }

  async delete(id: string, organizationId: string): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);

    if (bsc.status === 'active') {
      throw new ForbiddenException('Cannot delete active balanced scorecards');
    }

    const deleted = await this.bscModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Balanced Scorecard not found');
    return deleted;
  }

  async getPerformanceSummary(id: string, organizationId: string): Promise<{
    overallScore: number;
    perspectives: Array<{
      name: string;
      score: number;
      objectiveCount: number;
      onTrackCount: number;
      atRiskCount: number;
      offTrackCount: number;
    }>;
  }> {
    const bsc = await this.findOne(id, organizationId);

    const perspectiveSummaries = bsc.perspectives.map(p => {
      const objectives = p.objectives || [];
      const scores = objectives.map(obj => (obj.current / obj.target) * 100);
      const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

      return {
        name: p.perspective,
        score: Math.min(100, Math.round(avgScore)),
        objectiveCount: objectives.length,
        onTrackCount: objectives.filter(o => o.status === 'on_track').length,
        atRiskCount: objectives.filter(o => o.status === 'at_risk').length,
        offTrackCount: objectives.filter(o => o.status === 'off_track').length,
      };
    });

    const overallScore = Math.round(
      perspectiveSummaries.reduce((sum, p) => sum + p.score, 0) / perspectiveSummaries.length,
    );

    return {
      overallScore,
      perspectives: perspectiveSummaries,
    };
  }

  async markAsReviewed(id: string, organizationId: string, reviewerUserId: string): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);

    const updated = await this.bscModel
      .findByIdAndUpdate(
        id,
        {
          lastReviewedBy: new Types.ObjectId(reviewerUserId),
          lastReviewDate: new Date(),
        },
        { new: true },
      )
      .populate(['createdBy', 'lastReviewedBy']);

    if (!updated) throw new NotFoundException('Balanced Scorecard not found');
    return updated;
  }
}
