import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { AuditService } from '../audit/audit.service';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';
import { User } from '../users/schemas/user.schema';
import { CreateReportingPeriodDto, UpdateReportingPeriodDto, UpsertIndicatorResultDto, UpsertIndicatorTargetDto } from './dto/reporting.dto';
import { IndicatorResult } from './schemas/indicator-result.schema';
import { IndicatorTarget } from './schemas/indicator-target.schema';
import { ReportingPeriod } from './schemas/reporting-period.schema';

@Injectable()
export class ReportingService {
  constructor(
    @InjectModel(ReportingPeriod.name) private readonly periodModel: Model<ReportingPeriod>,
    @InjectModel(IndicatorResult.name) private readonly resultModel: Model<IndicatorResult>,
    @InjectModel(IndicatorTarget.name) private readonly targetModel: Model<IndicatorTarget>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly audit: AuditService,
  ) {}

  async createPeriod(organizationId: string, dto: CreateReportingPeriodDto) {
    await this.assertProject(organizationId, dto.projectId);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('Reporting period end date must be after start date');
    }
    const period = await this.periodModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(dto.projectId),
      name: dto.name,
      cadence: dto.cadence ?? 'quarterly',
      startDate,
      endDate,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      notes: dto.notes,
    });
    await this.audit.record({
      organizationId,
      action: 'reporting_period.created',
      entityType: 'ReportingPeriod',
      entityId: period._id.toString(),
      metadata: { projectId: dto.projectId, name: dto.name },
    });
    return period;
  }

  async updatePeriod(organizationId: string, reportingPeriodId: string, dto: UpdateReportingPeriodDto) {
    const period = await this.getEditablePeriod(organizationId, reportingPeriodId);

    const update: Record<string, unknown> = {};
    if (dto.name !== undefined)     update.name = dto.name;
    if (dto.cadence !== undefined)  update.cadence = dto.cadence;
    if (dto.notes !== undefined)    update.notes = dto.notes;
    if (dto.dueDate !== undefined)  update.dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;

    const startDate = dto.startDate ? new Date(dto.startDate) : period.startDate;
    const endDate   = dto.endDate   ? new Date(dto.endDate)   : period.endDate;
    if (endDate < startDate) {
      throw new BadRequestException('Reporting period end date must be after start date');
    }
    if (dto.startDate !== undefined) update.startDate = startDate;
    if (dto.endDate !== undefined)   update.endDate = endDate;

    const updated = await this.periodModel
      .findByIdAndUpdate(reportingPeriodId, update, { new: true })
      .lean();
    await this.audit.record({
      organizationId,
      action: 'reporting_period.updated',
      entityType: 'ReportingPeriod',
      entityId: reportingPeriodId,
      metadata: { fields: Object.keys(update) },
    });
    return this.enrichPeriod(updated!);
  }

  async listPeriods(organizationId: string, projectId?: string, status?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (projectId) {
      filter.projectId = new Types.ObjectId(projectId);
    }
    if (status) {
      filter.status = status;
    }
    const periods = await this.periodModel.find(filter).sort({ startDate: -1 }).lean();
    return Promise.all(periods.map((p) => this.enrichPeriod(p)));
  }

  async getPeriod(organizationId: string, id: string) {
    const period = await this.periodModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!period) {
      throw new NotFoundException('Reporting period not found');
    }
    return this.enrichPeriod(period);
  }

  /**
   * Attaches display-friendly fields the frontend needs that don't live
   * directly on the ReportingPeriod document: the project's name, resolved
   * submitter/approver names (only the ObjectId is stored on the period
   * itself), and how many activities fall inside this period's date range
   * (Activity has no direct reportingPeriodId — it's associated purely by
   * projectId + activityDate, the same association calculateResults() uses).
   */
  private async enrichPeriod<T extends Record<string, any>>(period: T) {
    const orgId = new Types.ObjectId(period.organizationId);
    const projectId = period.projectId;

    const [project, submittedByUser, approvedByUser, totalActivities, approvedActivities] = await Promise.all([
      this.projectModel.findOne({ _id: projectId, organizationId: orgId }).select('name').lean(),
      period.submittedByUserId
        ? this.userModel.findById(period.submittedByUserId).select('name email').lean()
        : null,
      period.approvedByUserId
        ? this.userModel.findById(period.approvedByUserId).select('name email').lean()
        : null,
      this.activityModel.countDocuments({
        organizationId: orgId,
        projectId,
        activityDate: { $gte: period.startDate, $lte: period.endDate },
      }),
      this.activityModel.countDocuments({
        organizationId: orgId,
        projectId,
        status: 'approved',
        activityDate: { $gte: period.startDate, $lte: period.endDate },
      }),
    ]);

    return {
      ...period,
      projectName: project?.name,
      submittedBy: submittedByUser ? { name: submittedByUser.name, email: submittedByUser.email } : undefined,
      approvedBy: approvedByUser ? { name: approvedByUser.name, email: approvedByUser.email } : undefined,
      totalActivities,
      approvedActivities,
    };
  }

  async calculateResults(organizationId: string, reportingPeriodId: string) {
    const period = await this.getEditablePeriod(organizationId, reportingPeriodId);
    const orgId = new Types.ObjectId(organizationId);
    const projectId = new Types.ObjectId(period.projectId);
    const indicators = await this.indicatorModel
      .find({ organizationId: orgId, projectId })
      .sort({ code: 1 })
      .lean();
    const activities = await this.activityModel
      .find({
        organizationId: orgId,
        projectId,
        status: 'approved',
        activityDate: { $gte: period.startDate, $lte: period.endDate },
      })
      .lean();
    const targets = await this.targetModel
      .find({
        organizationId: orgId,
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
      })
      .lean();
    const targetMap = new Map(targets.map((target) => [target.indicatorId.toString(), target]));

    // Load existing results to check if any were manually entered
    const existingResults = await this.resultModel
      .find({ organizationId: orgId, reportingPeriodId: new Types.ObjectId(reportingPeriodId) })
      .select('indicatorId source')
      .lean();
    const manualIndicatorIds = new Set(
      existingResults
        .filter((r: any) => r.source === 'manual')
        .map((r: any) => r.indicatorId.toString()),
    );

    // Build all updates in memory first, then send as a single bulkWrite
    // Skip indicators that have a manual result — don't silently overwrite them
    const bulkOps = indicators
      .filter((indicator) => !manualIndicatorIds.has(indicator._id.toString()))
      .map((indicator) => {
      const linked = activities.filter(
        (a) => a.indicatorId?.toString() === indicator._id.toString(),
      );
      const achieved = linked.reduce((sum, a) => sum + (a.quantity ?? 0), 0);
      const periodTarget = targetMap.get(indicator._id.toString());

      const doc = {
        organizationId: orgId,
        projectId,
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
        indicatorId: indicator._id,
        achieved,
        source: 'calculated',
        qualityFlags: this.qualityFlags({
          achieved,
          target: periodTarget?.target ?? indicator.target,
          activityCount: linked.length,
          evidenceMissing: linked.filter(
            (a) => !a.evidenceUrl && !a.evidenceNotes,
          ).length,
        }),
        activityCount: linked.length,
        sourceActivityIds: linked.map((a) => a._id),
        status: 'draft',
      };

      return {
        updateOne: {
          filter: {
            organizationId: orgId,
            reportingPeriodId: new Types.ObjectId(reportingPeriodId),
            indicatorId: indicator._id,
          },
          update: { $set: doc },
          upsert: true,
        },
      };
    });

    // Single round-trip to MongoDB instead of N sequential round-trips
    if (bulkOps.length > 0) {
      await this.resultModel.bulkWrite(bulkOps as any[], { ordered: false });
    }

    const results = await this.resultModel
      .find({
        organizationId: orgId,
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
      })
      .lean();

    await this.audit.record({
      organizationId,
      action: 'indicator_results.calculated',
      entityType: 'ReportingPeriod',
      entityId: reportingPeriodId,
      metadata: { resultCount: results.length },
    });
    return results;
  }

  async listResults(organizationId: string, reportingPeriodId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const periodObjId = new Types.ObjectId(reportingPeriodId);

    const [results, targets] = await Promise.all([
      this.resultModel
        .find({ organizationId: orgId, reportingPeriodId: periodObjId })
        .populate('indicatorId')
        .sort({ createdAt: 1 })
        .lean(),
      this.targetModel
        .find({ organizationId: orgId, reportingPeriodId: periodObjId })
        .lean(),
    ]);

    const targetByIndicator = new Map(targets.map((t) => [t.indicatorId.toString(), t]));

    return results.map((r: any) => {
      const periodTarget = targetByIndicator.get(r.indicatorId?._id?.toString() ?? r.indicatorId?.toString());
      // Fall back to the indicator's own default target if no period-specific
      // target was set — same fallback calculateResults() uses internally.
      const targetValue = periodTarget?.target ?? r.indicatorId?.target;
      const percentAchieved = targetValue ? Math.round((r.achieved / targetValue) * 1000) / 10 : null;
      return {
        ...r,
        targetValue: targetValue ?? null,
        baseline: periodTarget?.baseline ?? null,
        percentAchieved,
      };
    });
  }

  async upsertResult(organizationId: string, dto: UpsertIndicatorResultDto) {
    const period = await this.getEditablePeriod(organizationId, dto.reportingPeriodId);
    const indicator = await this.indicatorModel.findOne({
      _id: dto.indicatorId,
      organizationId: new Types.ObjectId(organizationId),
      projectId: period.projectId,
    });
    if (!indicator) {
      throw new NotFoundException('Indicator not found for this reporting period project');
    }

    const result = await this.resultModel.findOneAndUpdate(
      {
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(dto.reportingPeriodId),
        indicatorId: new Types.ObjectId(dto.indicatorId),
      },
      {
        organizationId: new Types.ObjectId(organizationId),
        projectId: period.projectId,
        reportingPeriodId: new Types.ObjectId(dto.reportingPeriodId),
        indicatorId: new Types.ObjectId(dto.indicatorId),
        achieved: dto.achieved,
        narrative: dto.narrative,
        disaggregations: dto.disaggregations ?? {},
        status: 'draft',
        source: 'manual', // Marks this result as manually entered — calculateResults will not overwrite it
      },
      { new: true, upsert: true },
    );
    await this.audit.record({
      organizationId,
      action: 'indicator_result.upserted',
      entityType: 'IndicatorResult',
      entityId: result?._id.toString(),
      metadata: { reportingPeriodId: dto.reportingPeriodId, indicatorId: dto.indicatorId },
    });
    return result;
  }

  async upsertTarget(organizationId: string, dto: UpsertIndicatorTargetDto) {
    const period = await this.getEditablePeriod(organizationId, dto.reportingPeriodId);
    const indicator = await this.indicatorModel.findOne({
      _id: dto.indicatorId,
      organizationId: new Types.ObjectId(organizationId),
      projectId: period.projectId,
    });
    if (!indicator) {
      throw new NotFoundException('Indicator not found for this reporting period project');
    }
    const target = await this.targetModel.findOneAndUpdate(
      {
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(dto.reportingPeriodId),
        indicatorId: new Types.ObjectId(dto.indicatorId),
      },
      {
        organizationId: new Types.ObjectId(organizationId),
        projectId: period.projectId,
        reportingPeriodId: new Types.ObjectId(dto.reportingPeriodId),
        indicatorId: new Types.ObjectId(dto.indicatorId),
        baseline: dto.baseline ?? indicator.baseline ?? 0,
        target: dto.target,
        notes: dto.notes,
      },
      { new: true, upsert: true },
    );
    await this.audit.record({
      organizationId,
      action: 'indicator_target.upserted',
      entityType: 'IndicatorTarget',
      entityId: target?._id.toString(),
      metadata: { reportingPeriodId: dto.reportingPeriodId, indicatorId: dto.indicatorId },
    });
    return target;
  }

  listTargets(organizationId: string, reportingPeriodId: string) {
    return this.targetModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
      })
      .populate('indicatorId')
      .sort({ createdAt: 1 })
      .lean();
  }

  targetsForPeriod(organizationId: string, reportingPeriodId: string) {
    return this.targetModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
      })
      .lean();
  }

  async transitionPeriod(
    organizationId: string,
    reportingPeriodId: string,
    status: 'open' | 'submitted' | 'approved' | 'locked',
    userId: string,
    notes?: string,
  ) {
    const period = await this.periodModel.findOne({
      _id: reportingPeriodId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!period) {
      throw new NotFoundException('Reporting period not found');
    }

    if (period.status === 'locked') {
      throw new ForbiddenException('Reporting period is locked');
    }

    const legalTransitions: Record<string, string[]> = {
      open:      ['submitted'],
      submitted: ['open', 'approved'],
      approved:  ['open', 'locked'],
    };
    if (!legalTransitions[period.status]?.includes(status)) {
      throw new BadRequestException(
        `Cannot move a "${period.status}" period to "${status}". ` +
        `Valid next steps: ${legalTransitions[period.status]?.join(', ') ?? 'none'}.`,
      );
    }

    const update: Record<string, unknown> = { status };
    const resultUpdate: Record<string, unknown> = { status };
    if (notes !== undefined) {
      update.notes = notes;
    }
    if (status === 'submitted') {
      update.submittedByUserId = new Types.ObjectId(userId);
      update.submittedAt = new Date();
      resultUpdate.submittedByUserId = new Types.ObjectId(userId);
      resultUpdate.submittedAt = update.submittedAt;
    }
    if (status === 'approved' || status === 'locked') {
      update.approvedByUserId = new Types.ObjectId(userId);
      update.approvedAt = new Date();
      resultUpdate.approvedByUserId = new Types.ObjectId(userId);
      resultUpdate.approvedAt = update.approvedAt;
    }
    if (status === 'open') {
      // Sent back for revision — clear whichever step we're undoing so the
      // History tab doesn't show a stale "submitted by"/"approved by" from
      // a cycle that no longer applies.
      if (period.status === 'submitted') {
        update.submittedByUserId = null;
        update.submittedAt = null;
        resultUpdate.submittedByUserId = null;
        resultUpdate.submittedAt = null;
      }
      if (period.status === 'approved') {
        update.approvedByUserId = null;
        update.approvedAt = null;
        resultUpdate.approvedByUserId = null;
        resultUpdate.approvedAt = null;
      }
    }

    const updated = await this.periodModel
      .findByIdAndUpdate(reportingPeriodId, update, { new: true })
      .lean();
    await this.resultModel.updateMany(
      {
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
      },
      resultUpdate,
    );
    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: `reporting_period.${status}`,
      entityType: 'ReportingPeriod',
      entityId: reportingPeriodId,
    });
    return this.enrichPeriod(updated!);
  }

  async updateNarrative(
    organizationId: string,
    reportingPeriodId: string,
    dto: { narrative?: string; challenges?: string; lessonsLearned?: string; nextPeriodPlans?: string },
  ) {
    const period = await this.periodModel.findOne({
      _id: reportingPeriodId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!period) throw new NotFoundException('Reporting period not found');
    if (period.status === 'locked') throw new ForbiddenException('Reporting period is locked');

    const updated = await this.periodModel.findByIdAndUpdate(
      reportingPeriodId,
      { $set: dto },
      { new: true },
    ).lean();
    return updated;
  }

  async approvedResultsForPeriod(organizationId: string, reportingPeriodId: string) {
    return this.resultModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
        status: { $in: ['approved', 'locked'] },
      })
      .lean();
  }

  async dataQuality(
    organizationId: string,
    projectId?: string,
    dateRange?: { from: Date; to: Date },
  ) {
    const orgId = new Types.ObjectId(organizationId);
    const projectFilter: Record<string, unknown> = { organizationId: orgId };
    if (projectId) projectFilter['projectId'] = new Types.ObjectId(projectId);

    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // When scoped to a reporting period, only count activities that fall
    // inside that period's date range — otherwise this reports on the
    // project's entire history, which is correct for the standalone Data
    // Quality view but misleading when shown inside a specific period.
    const activityDateMatch: Record<string, unknown> = dateRange
      ? { activityDate: { $gte: dateRange.from, $lte: dateRange.to } }
      : {};

    // Single aggregation — join activities into indicators server-side (H2 fix)
    // No full collection loaded into Node.js heap
    const indicatorAlerts = await this.indicatorModel.aggregate([
      { $match: projectFilter },
      {
        $lookup: {
          from: 'activities',
          let: { indId: '$_id', orgId: '$organizationId', projId: '$projectId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$indicatorId', '$$indId'] },
                    { $eq: ['$organizationId', '$$orgId'] },
                  ],
                },
                ...activityDateMatch,
              },
            },
            { $project: { activityDate: 1, evidenceUrl: 1, evidenceNotes: 1, status: 1 } },
          ],
          as: 'activities',
        },
      },
      {
        $project: {
          _id: 1,
          code: 1,
          target: 1,
          activityCount: { $size: '$activities' },
          hasNoTarget: { $not: ['$target'] },
          latestActivity: { $max: '$activities.activityDate' },
          staleData: {
            $lt: [{ $max: '$activities.activityDate' }, sixtyDaysAgo],
          },
        },
      },
    ]);

    const activityAlerts = await this.activityModel.aggregate([
      { $match: { ...projectFilter, status: 'approved', ...activityDateMatch } },
      {
        $project: {
          _id: 1,
          title: 1,
          quantity: 1,
          participants: 1,
          evidenceUrl: 1,
          evidenceNotes: 1,
          missingEvidence: {
            $and: [
              { $not: ['$evidenceUrl'] },
              { $not: ['$evidenceNotes'] },
            ],
          },
          hasNegativeValues: {
            $or: [{ $lt: ['$quantity', 0] }, { $lt: ['$participants', 0] }],
          },
        },
      },
    ]);

    const alerts: Array<{
      severity: 'critical' | 'warning' | 'info';
      entityType: string;
      entityId?: string;
      message: string;
    }> = [];

    for (const ind of indicatorAlerts) {
      if (ind.hasNoTarget) {
        alerts.push({ severity: 'critical', entityType: 'Indicator', entityId: ind._id.toString(), message: `${ind.code} has no target.` });
      }
      if (ind.activityCount === 0) {
        alerts.push({ severity: 'warning', entityType: 'Indicator', entityId: ind._id.toString(), message: `${ind.code} has no approved activity evidence.` });
      }
      if (ind.latestActivity && ind.staleData) {
        alerts.push({ severity: 'warning', entityType: 'Indicator', entityId: ind._id.toString(), message: `${ind.code} has stale data older than 60 days.` });
      }
    }

    for (const act of activityAlerts) {
      if (act.missingEvidence) {
        alerts.push({ severity: 'info', entityType: 'Activity', entityId: act._id.toString(), message: `${act.title} is approved without evidence notes or link.` });
      }
      if (act.hasNegativeValues) {
        alerts.push({ severity: 'critical', entityType: 'Activity', entityId: act._id.toString(), message: `${act.title} has negative values.` });
      }
    }

    return {
      generatedAt: now.toISOString(),
      counts: {
        indicators: indicatorAlerts.length,
        activities: activityAlerts.length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
        warning:  alerts.filter((a) => a.severity === 'warning').length,
        info:     alerts.filter((a) => a.severity === 'info').length,
      },
      alerts,
    };
  }

  private async assertProject(organizationId: string, projectId: string) {
    const project = await this.projectModel.exists({
      _id: projectId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  private async getEditablePeriod(organizationId: string, reportingPeriodId: string) {
    const period = await this.periodModel.findOne({
      _id: reportingPeriodId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!period) {
      throw new NotFoundException('Reporting period not found');
    }
    if (period.status === 'locked') {
      throw new ForbiddenException('Reporting period is locked');
    }
    return period;
  }

  private qualityFlags(input: {
    achieved: number;
    target: number;
    activityCount: number;
    evidenceMissing: number;
  }) {
    const flags: string[] = [];
    if (input.activityCount === 0) flags.push('no_activity_evidence');
    if (input.evidenceMissing > 0) flags.push('missing_evidence');
    if (input.target > 0 && input.achieved > input.target * 1.25) flags.push('over_target_outlier');
    if (input.target > 0 && input.achieved < input.target * 0.25) flags.push('low_progress');
    return flags;
  }
}