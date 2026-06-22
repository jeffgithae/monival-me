import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../organizations/entitlements.service';
import { Activity } from '../activities/schemas/activity.schema';
import { Project } from '../projects/schemas/project.schema';
import { IndicatorResult } from '../reporting/schemas/indicator-result.schema';
import { IndicatorTarget } from '../reporting/schemas/indicator-target.schema';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { Indicator } from './schemas/indicator.schema';
import { paginate, toPaginatedResult } from '../common/types/paginated-results';
import { escapeRegex } from '../common/utils/escape-regex';

export interface IndicatorListQuery {
  projectId?: string;
  level?: string;
  isCore?: boolean;
  isActive?: boolean;
  standardFramework?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class IndicatorsService {
  constructor(
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Project.name)   private readonly projectModel: Model<Project>,
    @InjectModel(Activity.name)  private readonly activityModel: Model<Activity>,
    @InjectModel(IndicatorResult.name) private readonly resultModel: Model<IndicatorResult>,
    @InjectModel(IndicatorTarget.name) private readonly targetModel: Model<IndicatorTarget>,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  // ─── Validation ────────────────────────────────────────────────────────────

  private async assertProject(organizationId: string, projectId: string) {
    const project = await this.projectModel.findOne({
      _id: projectId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAll(organizationId: string, query: IndicatorListQuery = {}) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (query.projectId)              filter['projectId']         = new Types.ObjectId(query.projectId);
    if (query.level)                  filter['level']             = query.level;
    if (query.isCore !== undefined)   filter['isCore']            = query.isCore;
    if (query.isActive !== undefined) filter['isActive']          = query.isActive;
    if (query.standardFramework)      filter['standardFramework'] = query.standardFramework;
    if (query.search) {
      const re = new RegExp(escapeRegex(query.search), 'i');
      filter['$or'] = [{ code: re }, { title: re }, { definition: re }];
    }

    const { page, limit, skip } = paginate(query.page, query.limit, 500);
    const [data, total] = await Promise.all([
      this.indicatorModel.find(filter).sort({ sortOrder: 1, code: 1 }).skip(skip).limit(limit).lean(),
      this.indicatorModel.countDocuments(filter),
    ]);
    return toPaginatedResult(data, total, page, limit);
  }

  async findOne(organizationId: string, id: string) {
    const indicator = await this.indicatorModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!indicator) throw new NotFoundException('Indicator not found');
    return indicator;
  }

  // ─── Performance (current progress for one indicator) ─────────────────────

  async performance(organizationId: string, id: string) {
    const orgId     = new Types.ObjectId(organizationId);
    const indicator = await this.findOne(organizationId, id);
    const activities = await this.activityModel
      .find({
        organizationId: orgId,
        indicatorId:    new Types.ObjectId(id),
        status:         'approved',
      })
      .sort({ activityDate: 1 })
      .lean();

    const achieved   = activities.reduce((s, a) => s + (a.quantity ?? 0), 0);
    const pct        = indicator.target > 0
      ? Math.min(100, Math.round((achieved / indicator.target) * 100)) : 0;
    const remaining  = Math.max(0, indicator.target - achieved);

    // Trend: group by month
    const byMonth: Record<string, number> = {};
    for (const a of activities) {
      const key = new Date(a.activityDate).toISOString().slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + (a.quantity ?? 0);
    }
    const trend = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }));

    // Period-over-period: last two months
    const vals = trend.map(t => t.value);
    const periodTrend = vals.length < 2 ? 'n/a'
      : vals[vals.length - 1] > vals[vals.length - 2] ? 'up'
      : vals[vals.length - 1] < vals[vals.length - 2] ? 'down'
      : 'stable';

    // Disaggregation summary
    const disaggSummary: Record<string, Record<string, number>> = {};
    for (const a of activities) {
      for (const entry of (a.disaggregationData ?? [])) {
        disaggSummary[entry.category] ??= {};
        disaggSummary[entry.category][entry.value] =
          (disaggSummary[entry.category][entry.value] ?? 0) + entry.count;
      }
    }

    // Annual target progress
    const annualProgress = (indicator.annualTargets ?? []).map(at => {
      const yearActivities = activities.filter(a => new Date(a.activityDate).getFullYear() === at.year);
      const yearAchieved   = yearActivities.reduce((s, a) => s + (a.quantity ?? 0), 0);
      return { year: at.year, target: at.target, achieved: yearAchieved,
        pct: at.target > 0 ? Math.min(100, Math.round((yearAchieved / at.target) * 100)) : 0 };
    });

    return {
      indicator,
      achieved,
      pct,
      remaining,
      status: pct >= 75 ? 'on_track' : pct >= 40 ? 'at_risk' : 'behind',
      activityCount: activities.length,
      trend,
      periodTrend,
      disaggSummary,
      annualProgress,
      lastActivity: activities[activities.length - 1] ?? null,
    };
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(organizationId: string, dto: CreateIndicatorDto, actorUserId?: string) {
    await this.assertProject(organizationId, dto.projectId);
    await this.entitlements.assertCanAddIndicator(organizationId, dto.projectId);

    const indicator = await this.indicatorModel.create({
      organizationId:             new Types.ObjectId(organizationId),
      projectId:                  new Types.ObjectId(dto.projectId),
      parentId:                   dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      level:                      dto.level ?? 'output',
      code:                       dto.code,
      title:                      dto.title,
      definition:                 dto.definition,
      rationale:                  dto.rationale,
      unit:                       dto.unit,
      indicatorType:              dto.indicatorType ?? 'number',
      direction:                  dto.direction ?? 'increasing',
      cumulative:                 dto.cumulative ?? true,
      baseline:                   dto.baseline ?? 0,
      baselineSource:             dto.baselineSource,
      target:                     dto.target,
      annualTargets:              dto.annualTargets ?? [],
      frequency:                  dto.frequency ?? 'quarterly',
      disaggregation:             dto.disaggregation ?? [],
      disaggregationCategories:   dto.disaggregationCategories ?? [],
      genderMarker:               dto.genderMarker ?? 'n/a',
      isGenderDisaggregated:      dto.isGenderDisaggregated ?? false,
      isAgeDisaggregated:         dto.isAgeDisaggregated ?? false,
      dataSource:                 dto.dataSource,
      dataCollectionMethod:       dto.dataCollectionMethod,
      meansOfVerification:        dto.meansOfVerification,
      dataCollectionTool:         dto.dataCollectionTool,
      reportingResponsibility:    dto.reportingResponsibility,
      verificationFrequency:      dto.verificationFrequency ?? 'quarterly',
      responsiblePerson:          dto.responsiblePerson,
      responsibleUserId:          dto.responsibleUserId ? new Types.ObjectId(dto.responsibleUserId) : undefined,
      assumptions:                dto.assumptions,
      limitations:                dto.limitations,
      precautionsForDataQuality:  dto.precautionsForDataQuality,
      isCore:                     dto.isCore ?? false,
      isStandardIndicator:        dto.isStandardIndicator ?? false,
      standardIndicatorCode:      dto.standardIndicatorCode,
      standardFramework:          dto.standardFramework,
      sdgGoals:                   dto.sdgGoals ?? [],
      sdgTargets:                 dto.sdgTargets ?? [],
      sortOrder:                  dto.sortOrder ?? 0,
      isActive:                   true,
    });

    await this.audit.record({
      organizationId, actorUserId,
      action: 'indicator.created', entityType: 'Indicator',
      entityId: indicator._id.toString(),
      metadata: { code: indicator.code, title: indicator.title, projectId: dto.projectId },
    });

    return indicator;
  }

  async update(organizationId: string, id: string, dto: UpdateIndicatorDto, actorUserId?: string) {
    const update: Record<string, unknown> = { ...dto };
    if (dto.parentId)          update.parentId          = new Types.ObjectId(dto.parentId);
    if (dto.responsibleUserId) update.responsibleUserId = new Types.ObjectId(dto.responsibleUserId);
    if ((dto as any).projectId) delete update.projectId; // never allow moving indicator to different project
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const indicator = await this.indicatorModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        update,
        { new: true },
      ).lean();
    if (!indicator) throw new NotFoundException('Indicator not found');

    await this.audit.record({
      organizationId, actorUserId,
      action: 'indicator.updated', entityType: 'Indicator', entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return indicator;
  }

  // ─── Reorder ───────────────────────────────────────────────────────────────

  async reorder(organizationId: string, projectId: string, orderedIds: string[], actorUserId?: string) {
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.indicatorModel.updateOne(
          {
            _id: id,
            organizationId: new Types.ObjectId(organizationId),
            projectId:      new Types.ObjectId(projectId),
          },
          { sortOrder: idx },
        ),
      ),
    );
    await this.audit.record({
      organizationId, actorUserId,
      action: 'indicator.reordered', entityType: 'Indicator',
      metadata: { projectId, count: orderedIds.length },
    });
    return { reordered: true };
  }

  // ─── Annual targets ────────────────────────────────────────────────────────

  async upsertAnnualTarget(
    organizationId: string,
    id: string,
    year: number,
    target: number,
    notes?: string,
    actorUserId?: string,
  ) {
    const indicator = await this.indicatorModel.findOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    });
    if (!indicator) throw new NotFoundException('Indicator not found');

    const existing = indicator.annualTargets?.findIndex(t => t.year === year) ?? -1;
    if (existing >= 0) {
      indicator.annualTargets[existing] = { year, target, notes };
    } else {
      indicator.annualTargets = [...(indicator.annualTargets ?? []), { year, target, notes }];
    }
    indicator.annualTargets.sort((a, b) => a.year - b.year);
    await indicator.save();

    await this.audit.record({
      organizationId, actorUserId,
      action: 'indicator.annual_target.upserted', entityType: 'Indicator', entityId: id,
      metadata: { year, target },
    });
    return indicator;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(organizationId: string, id: string, actorUserId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const indicatorId = new Types.ObjectId(id);

    const result = await this.indicatorModel.deleteOne({
      _id: id, organizationId: orgId,
    });
    if (result.deletedCount === 0) throw new NotFoundException('Indicator not found');

    // Cascade: indicator results and targets are independently-keyed
    // collections (by indicatorId, not nested under Indicator), so they
    // are not removed automatically by Mongo and must be cleaned up here —
    // otherwise reporting periods retain results pointing at a deleted
    // indicator indefinitely.
    const [resultCount, targetCount] = await Promise.all([
      this.resultModel.deleteMany({ indicatorId, organizationId: orgId }),
      this.targetModel.deleteMany({ indicatorId, organizationId: orgId }),
    ]);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'indicator.deleted', entityType: 'Indicator', entityId: id,
      metadata: { cascadeDeleted: { resultCount: resultCount.deletedCount, targetCount: targetCount.deletedCount } },
    });
    return { deleted: true };
  }

  // ─── Bulk delete (for project cleanup) ────────────────────────────────────

  async removeByProject(organizationId: string, projectId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const projId = new Types.ObjectId(projectId);

    // Cascade results/targets for every indicator under this project before
    // the indicators themselves are removed.
    await Promise.all([
      this.resultModel.deleteMany({ projectId: projId, organizationId: orgId }),
      this.targetModel.deleteMany({ projectId: projId, organizationId: orgId }),
    ]);

    return this.indicatorModel.deleteMany({
      projectId: projId,
      organizationId: orgId,
    });
  }
}