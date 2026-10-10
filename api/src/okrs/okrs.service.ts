import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OKR, OKRDocument } from './schemas/okr.schema';
import { Project } from '../projects/schemas/project.schema';
import { IndicatorsService } from '../indicators/indicators.service';
import { CreateOKRDto, UpdateOKRDto, UpdateKeyResultDto } from './dto/okr.dto';
import { AuditService } from '../audit/audit.service';

// Only what the UI needs to label a linked project or person — populating whole
// documents shipped every project's full workplan with each OKR.
const POPULATE = [
  { path: 'ownerUserId', select: 'name email' },
  { path: 'createdBy', select: 'name email' },
  { path: 'reviewedBy', select: 'name email' },
  { path: 'linkedProjects', select: 'name status' },
];

type KeyResult = OKR['keyResults'][number];

/** Progress of one key result as a 0–100 percentage; a zero target counts as no progress. */
export function keyResultProgress(kr: Pick<KeyResult, 'currentValue' | 'targetValue'>): number {
  const target = Number(kr.targetValue);
  const current = Number(kr.currentValue) || 0;
  if (!(target > 0)) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

function overallProgress(keyResults: KeyResult[]): number {
  if (!keyResults?.length) return 0;
  return Math.round(keyResults.reduce((sum, kr) => sum + keyResultProgress(kr), 0) / keyResults.length);
}

@Injectable()
export class OKRService {
  constructor(
    @InjectModel(OKR.name) private okrModel: Model<OKRDocument>,
    @InjectModel(Project.name) private projectModel: Model<Project>,
    private readonly indicators: IndicatorsService,
    private readonly audit: AuditService,
  ) {}

  async create(organizationId: string, createDto: CreateOKRDto, actorUserId?: string): Promise<OKRDocument> {
    const keyResults = await this.normaliseKeyResults(organizationId, createDto.keyResults ?? []);
    const linkedProjects = await this.normaliseProjects(organizationId, createDto.linkedProjects);

    const okr = new this.okrModel({
      ...createDto,
      keyResults,
      organizationId: new Types.ObjectId(organizationId),
      ownerUserId: createDto.ownerUserId ? new Types.ObjectId(createDto.ownerUserId) : undefined,
      linkedProjects,
      createdBy: actorUserId ? new Types.ObjectId(actorUserId) : undefined,
      progressPercentage: overallProgress(keyResults as KeyResult[]),
    });

    const saved = await okr.save();
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'okr.created',
      entityType: 'OKR',
      entityId: saved._id.toString(),
      after: { title: saved.title, status: saved.status },
    });

    return this.findOne(saved._id.toString(), organizationId);
  }

  async findAll(organizationId: string, filters?: {
    status?: string;
    quarter?: number;
    year?: number;
    ownerUserId?: string;
    /** Only OKRs linked to this project. */
    projectId?: string;
  }): Promise<OKRDocument[]> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.status) query.status = filters.status;
    if (filters?.quarter) query.quarter = filters.quarter;
    if (filters?.year) query.year = filters.year;
    if (filters?.ownerUserId) query.ownerUserId = new Types.ObjectId(filters.ownerUserId);
    if (filters?.projectId && Types.ObjectId.isValid(filters.projectId)) query.linkedProjects = new Types.ObjectId(filters.projectId);

    const okrs = await this.okrModel
      .find(query)
      .sort({ year: -1, quarter: -1, createdAt: -1 })
      .populate(POPULATE);
    await this.syncFromIndicators(organizationId, okrs);
    return okrs;
  }

  async findOne(id: string, organizationId: string): Promise<OKRDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('OKR not found');
    const okr = await this.okrModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .populate(POPULATE);
    if (!okr) throw new NotFoundException('OKR not found');

    await this.syncFromIndicators(organizationId, [okr]);
    return okr;
  }

  /**
   * Progress of the given OKRs, keyed by id, after pulling the latest indicator
   * figures. The balanced scorecard rolls its objectives up from this.
   */
  async progressFor(organizationId: string, okrIds: Array<string | Types.ObjectId>) {
    const ids = okrIds.map((id) => id?.toString()).filter((id) => !!id && Types.ObjectId.isValid(id));
    const result = new Map<string, { title: string; progress: number; status: string; quarter: number; year: number }>();
    if (ids.length === 0) return result;
    const okrs = await this.okrModel.find({
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
      organizationId: new Types.ObjectId(organizationId),
    });
    await this.syncFromIndicators(organizationId, okrs);
    for (const okr of okrs) {
      result.set(okr._id.toString(), {
        title: okr.title,
        progress: okr.progressPercentage ?? 0,
        status: okr.status,
        quarter: okr.quarter,
        year: okr.year,
      });
    }
    return result;
  }

  async update(id: string, organizationId: string, updateDto: UpdateOKRDto, actorUserId?: string): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    const updateData: any = { ...updateDto };
    if (updateDto.ownerUserId) updateData.ownerUserId = new Types.ObjectId(updateDto.ownerUserId);
    if (updateDto.linkedProjects) {
      updateData.linkedProjects = await this.normaliseProjects(organizationId, updateDto.linkedProjects);
    }
    if (updateDto.keyResults) {
      updateData.keyResults = await this.normaliseKeyResults(organizationId, updateDto.keyResults);
      updateData.progressPercentage = overallProgress(updateData.keyResults);
    }

    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    await this.okrModel.findByIdAndUpdate(id, updateData, { runValidators: true });

    if (updateDto.status && updateDto.status !== okr.status) {
      await this.audit.record({
        organizationId,
        actorUserId,
        action: 'okr.status_changed',
        entityType: 'OKR',
        entityId: id,
        before: { status: okr.status },
        after: { status: updateDto.status },
      });
    }

    return this.findOne(id, organizationId);
  }

  async updateKeyResult(
    id: string,
    krIndex: number,
    organizationId: string,
    updateDto: UpdateKeyResultDto,
  ): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    const kr = okr.keyResults[krIndex];
    if (!kr) {
      throw new NotFoundException('Key Result not found');
    }

    if (updateDto.indicatorId !== undefined) {
      if (updateDto.indicatorId) {
        const known = await this.indicators.achievedFor(organizationId, [updateDto.indicatorId]);
        if (!known.has(updateDto.indicatorId)) throw new BadRequestException('Indicator not found');
        kr.indicatorId = new Types.ObjectId(updateDto.indicatorId);
      } else {
        kr.indicatorId = null;
      }
    }
    if (updateDto.title) kr.title = updateDto.title;
    // A linked key result takes its value from the indicator, not from the form.
    if (updateDto.currentValue !== undefined && !kr.indicatorId) kr.currentValue = updateDto.currentValue;
    if (updateDto.confidence !== undefined) kr.confidence = updateDto.confidence;
    if (updateDto.status) kr.status = updateDto.status;
    if (updateDto.notes !== undefined) kr.notes = updateDto.notes;

    await this.okrModel.findByIdAndUpdate(id, {
      keyResults: okr.keyResults,
      progressPercentage: overallProgress(okr.keyResults),
    });

    return this.findOne(id, organizationId);
  }

  async delete(id: string, organizationId: string, actorUserId?: string): Promise<OKRDocument> {
    const okr = await this.findOne(id, organizationId);

    if (okr.status === 'active') {
      throw new ForbiddenException('Cannot delete active OKRs');
    }

    const deleted = await this.okrModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('OKR not found');
    }
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'okr.deleted',
      entityType: 'OKR',
      entityId: id,
      before: { title: okr.title },
    });

    return deleted;
  }

  /** The reviewer is always the authenticated caller, never an id from the request body. */
  async markAsReviewed(id: string, organizationId: string, reviewerUserId: string): Promise<OKRDocument> {
    await this.findOne(id, organizationId);
    await this.okrModel.findByIdAndUpdate(id, {
      reviewedBy: new Types.ObjectId(reviewerUserId),
      reviewDate: new Date(),
    });
    await this.audit.record({
      organizationId,
      actorUserId: reviewerUserId,
      action: 'okr.reviewed',
      entityType: 'OKR',
      entityId: id,
    });
    return this.findOne(id, organizationId);
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
      progress: keyResultProgress(kr),
      confidence: kr.confidence,
      status: kr.status,
    }));

    return {
      overallProgress: overallProgress(okr.keyResults),
      keyResults,
    };
  }

  async getQuarterlyOKRs(organizationId: string, year: number, quarter: number): Promise<OKRDocument[]> {
    return this.findAll(organizationId, { year, quarter });
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Pull the current value of indicator-linked key results from the
   * indicators module and persist any change, so the stored progress (which
   * lists and the scorecard read) never drifts from field data.
   */
  private async syncFromIndicators(organizationId: string, okrs: OKRDocument[]): Promise<void> {
    const linkedIds = okrs.flatMap((o) => o.keyResults.map((kr) => kr.indicatorId).filter((id) => !!id)) as Types.ObjectId[];
    const achieved = linkedIds.length ? await this.indicators.achievedFor(organizationId, linkedIds) : new Map<string, number>();

    for (const okr of okrs) {
      let dirty = false;
      for (const kr of okr.keyResults) {
        const value = kr.indicatorId ? achieved.get(kr.indicatorId.toString()) : undefined;
        if (value !== undefined && value !== kr.currentValue) {
          kr.currentValue = value;
          dirty = true;
        }
      }
      const progress = overallProgress(okr.keyResults);
      if (dirty || progress !== okr.progressPercentage) {
        okr.progressPercentage = progress;
        await this.okrModel.updateOne(
          { _id: okr._id },
          { keyResults: okr.keyResults, progressPercentage: progress },
        );
      }
    }
  }

  /** Cast ids, and refuse indicators that are not this organisation's. */
  private async normaliseKeyResults(organizationId: string, keyResults: Array<Record<string, any>>) {
    const wanted = keyResults.map((kr) => kr.indicatorId).filter((id): id is string => !!id);
    const known = wanted.length ? await this.indicators.achievedFor(organizationId, wanted) : new Map<string, number>();
    return keyResults.map((kr) => {
      if (kr.indicatorId && !known.has(String(kr.indicatorId))) {
        throw new BadRequestException(`Indicator not found for key result "${kr.title}"`);
      }
      const indicatorId = kr.indicatorId ? new Types.ObjectId(String(kr.indicatorId)) : null;
      return {
        ...kr,
        indicatorId,
        currentValue: indicatorId ? known.get(indicatorId.toString()) ?? 0 : kr.currentValue ?? 0,
      };
    });
  }

  private async normaliseProjects(organizationId: string, projectIds?: string[]) {
    if (!projectIds) return undefined;
    const ids = [...new Set(projectIds)].map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return [];
    const found = await this.projectModel.countDocuments({
      _id: { $in: ids },
      organizationId: new Types.ObjectId(organizationId),
    });
    if (found !== ids.length) throw new BadRequestException('One or more linked projects were not found');
    return ids;
  }
}
