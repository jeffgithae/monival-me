import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { AuditService } from '../audit/audit.service';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';
import { CreateReportingPeriodDto, UpsertIndicatorResultDto, UpsertIndicatorTargetDto } from './dto/reporting.dto';
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

  listPeriods(organizationId: string, projectId?: string, status?: string) {
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (projectId) {
      filter.projectId = new Types.ObjectId(projectId);
    }
    if (status) {
      filter.status = status;
    }
    return this.periodModel.find(filter).sort({ startDate: -1 }).lean();
  }

  async getPeriod(organizationId: string, id: string) {
    const period = await this.periodModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!period) {
      throw new NotFoundException('Reporting period not found');
    }
    return period;
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

    // Build all updates in memory first, then send as a single bulkWrite (C2 fix)
    const bulkOps = indicators.map((indicator) => {
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

  listResults(organizationId: string, reportingPeriodId: string) {
    return this.resultModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        reportingPeriodId: new Types.ObjectId(reportingPeriodId),
      })
      .populate('indicatorId')
      .sort({ createdAt: 1 })
      .lean();
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
    status: 'submitted' | 'approved' | 'locked',
    userId: string,
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

    const update: Record<string, unknown> = { status };
    const resultUpdate: Record<string, unknown> = { status };
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
    return updated;
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

  async dataQuality(organizationId: string, projectId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const projectFilter: Record<string, unknown> = { organizationId: orgId };
    if (projectId) projectFilter['projectId'] = new Types.ObjectId(projectId);

    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

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
      { $match: { ...projectFilter, status: 'approved' } },
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