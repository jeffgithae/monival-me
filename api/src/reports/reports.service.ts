import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Project } from '../projects/schemas/project.schema';
import { ReportingService } from '../reporting/reporting.service';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    private readonly reportingService: ReportingService,
  ) {}

  async donorReport(
    organizationId: string,
    projectId: string,
    fromDate?: string,
    toDate?: string,
    reportingPeriodId?: string,
  ) {
    const orgId = new Types.ObjectId(organizationId);
    const project = await this.projectModel
      .findOne({ _id: projectId, organizationId: orgId })
      .lean();
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const org = await this.orgModel.findById(orgId).lean();
    const reportingPeriod = reportingPeriodId
      ? await this.reportingService.getPeriod(organizationId, reportingPeriodId)
      : null;
    const periodResults = reportingPeriodId
      ? await this.reportingService.approvedResultsForPeriod(organizationId, reportingPeriodId)
      : [];
    const periodTargets = reportingPeriodId
      ? await this.reportingService.targetsForPeriod(organizationId, reportingPeriodId)
      : [];
    const periodResultMap = new Map(periodResults.map((r) => [r.indicatorId.toString(), r]));
    const periodTargetMap = new Map(periodTargets.map((target) => [target.indicatorId.toString(), target]));
    const indicators = await this.indicatorModel
      .find({ projectId: new Types.ObjectId(projectId), organizationId: orgId })
      .sort({ code: 1 })
      .lean();

    const activityFilter: Record<string, unknown> = {
      projectId: new Types.ObjectId(projectId),
      organizationId: orgId,
      status: { $in: ['approved', 'submitted'] },
    };
    const periodFromDate = reportingPeriod?.startDate ? new Date(reportingPeriod.startDate) : undefined;
    const periodToDate = reportingPeriod?.endDate ? new Date(reportingPeriod.endDate) : undefined;

    if (reportingPeriod || fromDate || toDate) {
      activityFilter.activityDate = {};
      if (periodFromDate || fromDate) {
        (activityFilter.activityDate as Record<string, Date>).$gte = periodFromDate ?? new Date(fromDate as string);
      }
      if (periodToDate || toDate) {
        (activityFilter.activityDate as Record<string, Date>).$lte = periodToDate ?? new Date(toDate as string);
      }
    }

    const activities = await this.activityModel
      .find(activityFilter)
      .sort({ activityDate: -1 })
      .lean();

    const approvedOnly = activities.filter((a) => a.status === 'approved');
    const forProgress = approvedOnly.length > 0 ? approvedOnly : activities;

    const progressByIndicator = await Promise.all(
      indicators.map(async (indicator) => {
        const linked = forProgress.filter(
          (a) => a.indicatorId?.toString() === indicator._id.toString(),
        );
        const lockedResult = periodResultMap.get(indicator._id.toString());
        const periodTarget = periodTargetMap.get(indicator._id.toString());
        const achieved = lockedResult?.achieved ?? linked.reduce((sum, a) => sum + (a.quantity ?? 0), 0);
        const target = periodTarget?.target ?? indicator.target;
        const baseline = periodTarget?.baseline ?? indicator.baseline ?? 0;
        const percent =
          target > baseline
            ? Math.min(100, Math.round(((achieved - baseline) / (target - baseline)) * 100))
            : achieved >= target
              ? 100
              : 0;

        return {
          id: indicator._id.toString(),
          code: indicator.code,
          title: indicator.title,
          unit: indicator.unit,
          baseline,
          target,
          achieved,
          percentComplete: percent,
          activityCount: lockedResult?.activityCount ?? linked.length,
          status: lockedResult?.status ?? 'calculated',
          narrative: lockedResult?.narrative,
          disaggregations: lockedResult?.disaggregations,
        };
      }),
    );

    const totalParticipants = activities.reduce((s, a) => s + (a.participants ?? 0), 0);

    return {
      generatedAt: new Date().toISOString(),
      organization: org
        ? { name: org.name, country: org.country, sector: org.sector }
        : null,
      project: {
        id: project._id.toString(),
        name: project.name,
        donor: project.donor,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
      },
      reportingPeriod: reportingPeriod
        ? {
            id: reportingPeriod._id.toString(),
            name: reportingPeriod.name,
            startDate: reportingPeriod.startDate,
            endDate: reportingPeriod.endDate,
            status: reportingPeriod.status,
          }
        : null,
      summary: {
        indicatorCount: indicators.length,
        activityCount: activities.length,
        totalParticipants,
        averageProgress:
          progressByIndicator.length > 0
            ? Math.round(
                progressByIndicator.reduce((s, i) => s + i.percentComplete, 0) /
                  progressByIndicator.length,
              )
            : 0,
      },
      indicators: progressByIndicator,
      recentActivities: activities.slice(0, 10).map((a) => ({
        id: a._id.toString(),
        title: a.title,
        activityDate: a.activityDate,
        location: a.location,
        participants: a.participants,
        quantity: a.quantity,
        indicatorId: a.indicatorId?.toString(),
      })),
    };
  }

  async donorReportCsv(
    organizationId: string,
    projectId: string,
    fromDate?: string,
    toDate?: string,
    reportingPeriodId?: string,
  ) {
    const report = await this.donorReport(organizationId, projectId, fromDate, toDate, reportingPeriodId);
    const rows = [
      ['Project', report.project.name],
      ['Organization', report.organization?.name ?? ''],
      ['Generated at', report.generatedAt],
      ['Reporting period', report.reportingPeriod?.name ?? 'Date range'],
      [],
      ['Code', 'Indicator', 'Baseline', 'Target', 'Achieved', 'Progress %', 'Status', 'Narrative'],
      ...report.indicators.map((indicator) => [
        indicator.code,
        indicator.title,
        indicator.baseline,
        indicator.target,
        indicator.achieved,
        indicator.percentComplete,
        indicator.status ?? 'calculated',
        indicator.narrative ?? '',
      ]),
    ];
    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
  }

  importTemplate(kind: string) {
    const templates: Record<string, string[]> = {
      projects: ['name', 'donor', 'description', 'startDate', 'endDate', 'status', 'country', 'region', 'district', 'latitude', 'longitude'],
      indicators: ['projectCode', 'level', 'code', 'title', 'unit', 'baseline', 'target', 'frequency', 'meansOfVerification', 'assumptions', 'disaggregation'],
      activities: ['projectCode', 'indicatorCode', 'title', 'activityDate', 'location', 'latitude', 'longitude', 'participants', 'quantity', 'evidenceUrl', 'evidenceNotes', 'partnerName'],
      results: ['reportingPeriodName', 'indicatorCode', 'achieved', 'narrative', 'disaggregationsJson'],
      partners: ['name', 'contactEmail', 'contactPhone', 'country', 'region', 'district', 'latitude', 'longitude', 'notes'],
    };
    const header = templates[kind];
    if (!header) {
      return 'kind,error\nunknown,Supported templates: projects indicators activities results partners\n';
    }
    return `${header.join(',')}\n`;
  }

  private csvCell(value: unknown) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }
}
