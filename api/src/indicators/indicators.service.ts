import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../organizations/entitlements.service';
import { Activity } from '../activities/schemas/activity.schema';
import { Project } from '../projects/schemas/project.schema';
import { IndicatorResult } from '../reporting/schemas/indicator-result.schema';
import { IndicatorTarget } from '../reporting/schemas/indicator-target.schema';
import { ReportingPeriod } from '../reporting/schemas/reporting-period.schema';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { Indicator } from './schemas/indicator.schema';
import { paginate, toPaginatedResult } from '../common/types/paginated-results';
import { escapeRegex } from '../common/utils/escape-regex';
import { FormResponse } from '../forms/schemas/form-response.schema';

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
    @InjectModel(ReportingPeriod.name) private readonly periodModel: Model<ReportingPeriod>,
    @InjectModel(FormResponse.name) private readonly formResponseModel: Model<FormResponse>,
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

  // ─── Achievement (server-computed progress) ────────────────────────────────

  /**
   * Per-indicator achievement for every indicator on a project.
   *
   * This is the single source of truth for "how much has been achieved":
   * unbounded (an aggregation, not a page of activities) and restricted to
   * `approved` and `submitted` activities so drafts and rejected entries never
   * inflate a number. See `computeAchievement` for how finalised reporting
   * periods and later activity combine.
   */
  async achievementForProject(organizationId: string, projectId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const project = await this.projectModel
      .findOne({ _id: projectId, organizationId: orgId })
      .lean();
    if (!project) throw new NotFoundException('Project not found');

    const projectObjectId = new Types.ObjectId(projectId);
    const indicators = await this.indicatorModel
      .find({ projectId: projectObjectId, organizationId: orgId })
      .sort({ code: 1 })
      .lean();

    if (indicators.length === 0) {
      return { projectId, indicators: [] };
    }

    const computed = await this.computeAchievement(orgId, indicators, { projectId: projectObjectId });

    return {
      projectId,
      indicators: indicators.map((indicator) => {
        const key = indicator._id.toString();
        const result = computed.get(key)!;
        const achieved = result.achieved;

        const target = indicator.target ?? 0;
        const baseline = indicator.baseline ?? 0;
        const percentComplete = target > baseline
          ? Math.min(100, Math.max(0, Math.round(((achieved - baseline) / (target - baseline)) * 100)))
          : achieved >= target && target > 0 ? 100 : 0;

        return {
          indicatorId: key,
          achieved,
          target: indicator.target ?? null,
          baseline: indicator.baseline ?? 0,
          percentComplete,
          remaining: indicator.target ? Math.max(0, indicator.target - achieved) : null,
          isLocked: result.hasFinalisedPeriods,
          activityCount: result.activityCount,
          lastActivityDate: result.lastActivityDate,
        };
      }),
    };
  }

  /**
   * Achieved value for a set of indicators, with the same semantics as
   * `achievementForProject`. Other modules that roll indicator progress upward
   * — OKR key results, and through them the balanced scorecard — read from
   * here so every screen agrees on the number. Ids that don't belong to the
   * organisation are simply absent from the map.
   */
  async achievedFor(organizationId: string, indicatorIds: Array<string | Types.ObjectId>): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const ids = indicatorIds
      .map((id) => id?.toString())
      .filter((id): id is string => !!id && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return result;

    const orgId = new Types.ObjectId(organizationId);
    const indicators = await this.indicatorModel
      .find({ _id: { $in: ids }, organizationId: orgId })
      .select('cumulative')
      .lean();
    if (indicators.length === 0) return result;

    const computed = await this.computeAchievement(orgId, indicators);
    for (const [key, value] of computed) result.set(key, value.achieved);
    return result;
  }

  /**
   * How finalised reporting periods and live activity combine.
   *
   * A period result that has been approved or locked is authoritative *for
   * its own period*: later edits to that period's activities must not move a
   * figure a donor has already been given. It is not the indicator's total —
   * it used to be treated as one, so approving a single quarter made the
   * project page report that quarter's figure and ignore everything logged
   * since.
   *
   *  - Cumulative indicators (the default): the finalised period figures, plus
   *    activity dated outside those periods. Outside them, approved activity
   *    counts alone once any approved data exists; before that, submitted
   *    activity counts so a project mid-approval-cycle does not read as zero.
   *  - Snapshot indicators (`cumulative: false`, e.g. a rate): the most recent
   *    reading, whether that is a finalised period or a later activity.
   *
   * Evidence is activities plus approved form responses — the same union the
   * period calculation and the indicator's stored running total use. Leaving
   * form responses out here made the project page disagree with both.
   */
  private async computeAchievement(
    orgId: Types.ObjectId,
    indicators: Array<{ _id: Types.ObjectId; cumulative?: boolean }>,
    scope: Record<string, unknown> = {},
  ) {
    const ids = indicators.map((i) => i._id);
    const evidenceMatch = { organizationId: orgId, ...scope, indicatorId: { $in: ids }, status: { $in: ['approved', 'submitted'] } };
    const sumByStatus = {
      approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, { $ifNull: ['$quantity', 0] }, 0] } },
      submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, { $ifNull: ['$quantity', 0] }, 0] } },
    };

    type Totals = { _id: Types.ObjectId; approved: number; submitted: number; lastActivityDate?: Date | null; activityCount?: number };
    const [totals, finals] = await Promise.all([
      this.activityModel.aggregate<Totals>([
        { $match: evidenceMatch },
        { $group: { _id: '$indicatorId', ...sumByStatus, lastActivityDate: { $max: '$activityDate' }, activityCount: { $sum: 1 } } },
      ]),
      this.resultModel
        .find({ organizationId: orgId, indicatorId: { $in: ids }, status: { $in: ['approved', 'locked'] } })
        .select('indicatorId reportingPeriodId achieved')
        .lean(),
    ]);
    const totalMap = new Map(totals.map((t) => [t._id.toString(), t]));

    // Approved form responses (including Kobo/ODK/CommCare syncs) are evidence too.
    const formMatch = { organizationId: orgId, ...scope, indicatorId: { $in: ids }, approvalStatus: 'approved' };
    const formTotals = await this.formResponseModel.aggregate<{ _id: Types.ObjectId; total: number; count: number; last: Date | null }>([
      { $match: formMatch },
      { $group: { _id: '$indicatorId', total: { $sum: { $ifNull: ['$indicatorValue', 0] } }, count: { $sum: 1 }, last: { $max: '$collectedAt' } } },
    ]);
    const formMap = new Map(formTotals.map((f) => [f._id.toString(), f]));

    // The window each finalised result stands for.
    const periodIds = [...new Set(finals.map((r) => r.reportingPeriodId?.toString()).filter((id): id is string => !!id))];
    const periods = periodIds.length
      ? await this.periodModel
          .find({ _id: { $in: periodIds.map((id) => new Types.ObjectId(id)) }, organizationId: orgId })
          .select('startDate endDate')
          .lean()
      : [];
    const periodById = new Map(periods.map((p) => [p._id.toString(), p]));
    const windows = new Map<string, Array<{ start: Date; end: Date; achieved: number }>>();
    for (const r of finals) {
      const period = periodById.get(r.reportingPeriodId?.toString() ?? '');
      if (!period) continue;
      const key = r.indicatorId.toString();
      windows.set(key, [...(windows.get(key) ?? []), { start: period.startDate, end: period.endDate, achieved: r.achieved ?? 0 }]);
    }

    // Activity already represented by a finalised result must not be counted again.
    const clauses = [...windows].flatMap(([key, list]) =>
      list.map((w) => ({ indicatorId: new Types.ObjectId(key), activityDate: { $gte: w.start, $lte: w.end } })),
    );
    const covered = clauses.length
      ? await this.activityModel.aggregate<Totals>([
          { $match: { ...evidenceMatch, $or: clauses } },
          { $group: { _id: '$indicatorId', ...sumByStatus } },
        ])
      : [];
    const coveredMap = new Map(covered.map((c) => [c._id.toString(), c]));
    const coveredForms = clauses.length && formTotals.length
      ? await this.formResponseModel.aggregate<{ _id: Types.ObjectId; total: number }>([
          { $match: { ...formMatch, $or: clauses.map((c) => ({ indicatorId: c.indicatorId, collectedAt: c.activityDate })) } },
          { $group: { _id: '$indicatorId', total: { $sum: { $ifNull: ['$indicatorValue', 0] } } } },
        ])
      : [];
    const coveredFormMap = new Map(coveredForms.map((c) => [c._id.toString(), c.total]));

    // Snapshot indicators need the latest reading rather than a sum.
    const snapshotIds = indicators.filter((i) => i.cumulative === false).map((i) => i._id);
    const latest = snapshotIds.length
      ? await this.activityModel.aggregate<{ _id: Types.ObjectId; quantity: number; activityDate: Date }>([
          { $match: { ...evidenceMatch, indicatorId: { $in: snapshotIds } } },
          // Approved readings outrank submitted ones; then the most recent wins.
          { $addFields: { rank: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } } },
          { $sort: { rank: -1, activityDate: -1, createdAt: -1 } },
          { $group: { _id: '$indicatorId', quantity: { $first: { $ifNull: ['$quantity', 0] } }, activityDate: { $first: '$activityDate' } } },
        ])
      : [];
    const latestMap = new Map(latest.map((l) => [l._id.toString(), l]));
    const latestForms = snapshotIds.length && formTotals.length
      ? await this.formResponseModel.aggregate<{ _id: Types.ObjectId; quantity: number; activityDate: Date }>([
          { $match: { ...formMatch, indicatorId: { $in: snapshotIds } } },
          { $sort: { collectedAt: -1, createdAt: -1 } },
          { $group: { _id: '$indicatorId', quantity: { $first: { $ifNull: ['$indicatorValue', 0] } }, activityDate: { $first: '$collectedAt' } } },
        ])
      : [];
    for (const form of latestForms) {
      const key = form._id.toString();
      const activity = latestMap.get(key);
      if (!activity || form.activityDate > activity.activityDate) latestMap.set(key, form);
    }

    const out = new Map<string, { achieved: number; hasFinalisedPeriods: boolean; activityCount: number; lastActivityDate: Date | null }>();
    for (const indicator of indicators) {
      const key = indicator._id.toString();
      const total = totalMap.get(key);
      const finalised = windows.get(key) ?? [];
      let achieved: number;

      if (indicator.cumulative === false) {
        const lastFinal = [...finalised].sort((a, b) => b.end.getTime() - a.end.getTime())[0];
        const reading = latestMap.get(key);
        achieved = reading && (!lastFinal || reading.activityDate > lastFinal.end)
          ? reading.quantity
          : lastFinal?.achieved ?? 0;
      } else {
        const finalSum = finalised.reduce((sum, w) => sum + w.achieved, 0);
        const inside = coveredMap.get(key);
        const formsOutside = Math.max(0, (formMap.get(key)?.total ?? 0) - (coveredFormMap.get(key) ?? 0));
        const approvedOutside = Math.max(0, (total?.approved ?? 0) - (inside?.approved ?? 0)) + formsOutside;
        const submittedOutside = Math.max(0, (total?.submitted ?? 0) - (inside?.submitted ?? 0));
        const hasApprovedData = finalSum > 0 || approvedOutside > 0;
        achieved = finalSum + (hasApprovedData ? approvedOutside : submittedOutside);
      }

      out.set(key, {
        achieved,
        hasFinalisedPeriods: finalised.length > 0,
        activityCount: (total?.activityCount ?? 0) + (formMap.get(key)?.count ?? 0),
        lastActivityDate: [total?.lastActivityDate, formMap.get(key)?.last]
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      });
    }
    return out;
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

    // Per-reporting-period series: achieved (from calculated/manual results)
    // vs target for each period — the donor-facing progress trajectory.
    const results = await this.resultModel
      .find({ organizationId: orgId, indicatorId: new Types.ObjectId(id) })
      .lean();
    const targets = await this.targetModel
      .find({ organizationId: orgId, indicatorId: new Types.ObjectId(id) })
      .lean();
    const targetByPeriod = new Map(targets.map((t) => [t.reportingPeriodId.toString(), t]));
    const periodIds = [...new Set(results.map((r) => r.reportingPeriodId.toString()))];
    const periods = await this.periodModel
      .find({ _id: { $in: periodIds.map((pid) => new Types.ObjectId(pid)) } })
      .lean();
    const periodMap = new Map(periods.map((per) => [per._id.toString(), per]));
    const periodSeries = results
      .map((r) => {
        const period = periodMap.get(r.reportingPeriodId.toString());
        const periodTarget = targetByPeriod.get(r.reportingPeriodId.toString());
        return period ? {
          periodId: period._id.toString(),
          periodName: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          periodStatus: period.status,
          achieved: r.achieved ?? 0,
          target: periodTarget?.target ?? indicator.target,
          source: (r as any).source,
        } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    return {
      indicator,
      achieved,
      pct,
      remaining,
      status: pct >= 75 ? 'on_track' : pct >= 40 ? 'at_risk' : 'behind',
      activityCount: activities.length,
      trend,
      periodTrend,
      periodSeries,
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