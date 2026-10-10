import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BalancedScorecard, BalancedScorecardDocument } from './schemas/balanced-scorecard.schema';
import { CreateBalancedScorecardDto, UpdateBalancedScorecardDto, UpdateObjectiveDto } from './dto/balanced-scorecard.dto';
import { AuditService } from '../audit/audit.service';
import { OKRService } from '../okrs/okrs.service';

const POPULATE = [
  { path: 'createdBy', select: 'name email' },
  { path: 'lastReviewedBy', select: 'name email' },
];

type Objective = BalancedScorecard['perspectives'][number]['objectives'][number];

/** Score of one objective as a 0–100 percentage; a zero or missing target counts as no progress. */
export function objectiveScore(objective: Pick<Objective, 'current' | 'target'>): number {
  const target = Number(objective.target);
  const current = Number(objective.current) || 0;
  if (!(target > 0)) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

/**
 * Score of a perspective: the objectives' scores weighted by their weight.
 * Falls back to a plain average when no objective carries a weight.
 */
export function perspectiveScore(objectives: Array<Pick<Objective, 'current' | 'target' | 'weight'>>): number {
  if (!objectives?.length) return 0;
  const totalWeight = objectives.reduce((sum, o) => sum + (Number(o.weight) > 0 ? Number(o.weight) : 0), 0);
  if (totalWeight > 0) {
    return Math.round(
      objectives.reduce((sum, o) => sum + objectiveScore(o) * (Number(o.weight) > 0 ? Number(o.weight) : 0), 0) / totalWeight,
    );
  }
  return Math.round(objectives.reduce((sum, o) => sum + objectiveScore(o), 0) / objectives.length);
}

@Injectable()
export class BalancedScorecardService {
  constructor(
    @InjectModel(BalancedScorecard.name) private bscModel: Model<BalancedScorecardDocument>,
    private readonly okrs: OKRService,
    private readonly audit: AuditService,
  ) {}

  async create(organizationId: string, createDto: CreateBalancedScorecardDto, actorUserId?: string): Promise<BalancedScorecardDocument> {
    await this.assertOkrsExist(organizationId, createDto.perspectives);
    const bsc = new this.bscModel({
      ...createDto,
      organizationId: new Types.ObjectId(organizationId),
      createdBy: actorUserId ? new Types.ObjectId(actorUserId) : undefined,
    });
    const saved = await bsc.save();

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'bsc.created',
      entityType: 'BalancedScorecard',
      entityId: saved._id.toString(),
      after: { name: saved.name, fiscalYear: saved.fiscalYear },
    });

    return this.findOne(saved._id.toString(), organizationId);
  }

  async findAll(organizationId: string, filters?: {
    fiscalYear?: number;
    status?: string;
  }): Promise<BalancedScorecardDocument[]> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.fiscalYear) query.fiscalYear = filters.fiscalYear;
    if (filters?.status) query.status = filters.status;

    const scorecards = await this.bscModel
      .find(query)
      .sort({ fiscalYear: -1, createdAt: -1 })
      .populate(POPULATE);
    await this.syncFromOkrs(organizationId, scorecards);
    return scorecards;
  }

  async findOne(id: string, organizationId: string): Promise<BalancedScorecardDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Balanced Scorecard not found');
    const bsc = await this.bscModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .populate(POPULATE);

    if (!bsc) {
      throw new NotFoundException('Balanced Scorecard not found');
    }

    await this.syncFromOkrs(organizationId, [bsc]);
    return bsc;
  }

  async update(
    id: string,
    organizationId: string,
    updateDto: UpdateBalancedScorecardDto,
    actorUserId?: string,
  ): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);
    if (updateDto.perspectives) await this.assertOkrsExist(organizationId, updateDto.perspectives);

    const updateData: Record<string, any> = { ...updateDto };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    await this.bscModel.findByIdAndUpdate(id, updateData, { runValidators: true });

    if (updateDto.status && updateDto.status !== bsc.status) {
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'bsc.status_changed',
        entityType: 'BalancedScorecard',
        entityId: id,
        before: { status: bsc.status },
        after: { status: updateDto.status },
      });
    }

    return this.findOne(id, organizationId);
  }

  async updateObjective(
    id: string,
    perspectiveIndex: number,
    objectiveIndex: number,
    organizationId: string,
    updateDto: UpdateObjectiveDto,
  ): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);

    const objective = bsc.perspectives[perspectiveIndex]?.objectives[objectiveIndex];
    if (!objective) {
      throw new NotFoundException('Objective not found');
    }

    if (updateDto.linkedOkrIds !== undefined) {
      await this.assertOkrsExist(organizationId, [{ objectives: [{ linkedOkrIds: updateDto.linkedOkrIds }] }]);
      objective.linkedOkrIds = [...new Set(updateDto.linkedOkrIds)].map((okrId) => new Types.ObjectId(okrId));
    }
    if (updateDto.title) objective.title = updateDto.title;
    if (updateDto.description !== undefined) objective.description = updateDto.description;
    if (updateDto.weight !== undefined) objective.weight = updateDto.weight;
    if (updateDto.target !== undefined) objective.target = updateDto.target;
    // An objective delivered by OKRs takes its progress from them, not from the form.
    if (updateDto.current !== undefined && !objective.linkedOkrIds?.length) objective.current = updateDto.current;
    if (updateDto.status) objective.status = updateDto.status;

    await this.bscModel.findByIdAndUpdate(id, { perspectives: bsc.perspectives }, { runValidators: true });
    return this.findOne(id, organizationId);
  }

  async delete(id: string, organizationId: string, actorUserId?: string): Promise<BalancedScorecardDocument> {
    const bsc = await this.findOne(id, organizationId);

    if (bsc.status === 'active') {
      throw new ForbiddenException('Cannot delete active balanced scorecards');
    }

    const deleted = await this.bscModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Balanced Scorecard not found');
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'bsc.deleted',
      entityType: 'BalancedScorecard',
      entityId: id,
      before: { name: bsc.name, fiscalYear: bsc.fiscalYear },
    });

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
      return {
        name: p.perspective,
        score: perspectiveScore(objectives),
        objectiveCount: objectives.length,
        onTrackCount: objectives.filter(o => o.status === 'on_track').length,
        atRiskCount: objectives.filter(o => o.status === 'at_risk').length,
        offTrackCount: objectives.filter(o => o.status === 'off_track').length,
      };
    });

    // A perspective with no objectives has nothing to score, so it must not
    // drag the overall figure towards zero.
    const scored = perspectiveSummaries.filter(p => p.objectiveCount > 0);
    const overallScore = scored.length
      ? Math.round(scored.reduce((sum, p) => sum + p.score, 0) / scored.length)
      : 0;

    return {
      overallScore,
      perspectives: perspectiveSummaries,
    };
  }

  /** The reviewer is always the authenticated caller, never an id from the request body. */
  async markAsReviewed(id: string, organizationId: string, reviewerUserId: string): Promise<BalancedScorecardDocument> {
    await this.findOne(id, organizationId);
    await this.bscModel.findByIdAndUpdate(id, {
      lastReviewedBy: new Types.ObjectId(reviewerUserId),
      lastReviewDate: new Date(),
    });
    await this.audit.record({
      organizationId,
      actorUserId: reviewerUserId,
      action: 'bsc.reviewed',
      entityType: 'BalancedScorecard',
      entityId: id,
    });
    return this.findOne(id, organizationId);
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Objectives linked to OKRs report the average progress of those OKRs,
   * expressed against the objective's own target. Persisted so lists and the
   * strategic overview read the same figure as the detail page.
   */
  private async syncFromOkrs(organizationId: string, scorecards: BalancedScorecardDocument[]): Promise<void> {
    const okrIds = scorecards.flatMap((b) =>
      b.perspectives.flatMap((p) => (p.objectives ?? []).flatMap((o) => o.linkedOkrIds ?? [])),
    );
    if (okrIds.length === 0) return;
    const progress = await this.okrs.progressFor(organizationId, okrIds);

    for (const bsc of scorecards) {
      let dirty = false;
      for (const perspective of bsc.perspectives) {
        for (const objective of perspective.objectives ?? []) {
          const linked = (objective.linkedOkrIds ?? [])
            .map((okrId) => progress.get(okrId.toString()))
            .filter((p): p is NonNullable<typeof p> => !!p);
          if (linked.length === 0) continue;
          const average = linked.reduce((sum, p) => sum + p.progress, 0) / linked.length;
          const current = Math.round((Number(objective.target) || 0) * average) / 100;
          if (current !== objective.current) {
            objective.current = current;
            dirty = true;
          }
        }
      }
      if (dirty) {
        await this.bscModel.updateOne({ _id: bsc._id }, { perspectives: bsc.perspectives });
      }
    }
  }

  private async assertOkrsExist(
    organizationId: string,
    perspectives: Array<{ objectives?: Array<{ linkedOkrIds?: string[] }> }> = [],
  ): Promise<void> {
    const ids = [...new Set(perspectives.flatMap((p) => (p.objectives ?? []).flatMap((o) => o.linkedOkrIds ?? [])))];
    if (ids.length === 0) return;
    const found = await this.okrs.progressFor(organizationId, ids);
    if (found.size !== ids.length) throw new BadRequestException('One or more linked OKRs were not found');
  }
}
