import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../../activities/schemas/activity.schema';
import { Indicator } from '../../indicators/schemas/indicator.schema';
import { Project } from '../../projects/schemas/project.schema';
import { ReportingPeriod } from '../../reporting/schemas/reporting-period.schema';
import { Beneficiary } from '../../beneficiaries/schemas/beneficiary.schema';
import { CopilotMessageDto } from './dto/copilot-message.dto';

@Injectable()
export class CopilotService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(ReportingPeriod.name) private readonly reportingPeriodModel: Model<ReportingPeriod>,
    @InjectModel(Beneficiary.name) private readonly beneficiaryModel: Model<Beneficiary>,
  ) {}

  async message(organizationId: string, dto: CopilotMessageDto) {
    const orgId = new Types.ObjectId(organizationId);
    const projectFilter = dto.projectId
      ? { organizationId: orgId, _id: new Types.ObjectId(dto.projectId) }
      : { organizationId: orgId };

    const [projects, indicators, activities, periods, benStats] = await Promise.all([
      this.projectModel.find(projectFilter).sort({ createdAt: -1 }).limit(8).lean(),
      this.indicatorModel.find(projectFilter).sort({ code: 1 }).limit(20).lean(),
      this.activityModel.find(projectFilter).sort({ activityDate: -1 }).limit(20).lean(),
      this.reportingPeriodModel.find(projectFilter).sort({ endDate: -1 }).limit(8).lean(),
      this.beneficiaryModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: {
          _id: null,
          total:     { $sum: 1 },
          active:    { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          noConsent: { $sum: { $cond: ['$consentGiven', 0, 1] } },
          vulnerable:{ $sum: { $cond: [{ $or: [
            '$isIdp', '$isRefugee', '$hasDisability',
            '$isFemaleHeadedHousehold', '$isOrphan', '$isChronicallyIll', '$isElderly',
          ]}, 1, 0] } },
        }},
      ]),
    ]);

    const submittedActivities = activities.filter((activity) => activity.status === 'submitted').length;
    const approvedActivities = activities.filter((activity) => activity.status === 'approved').length;
    const openPeriods = periods.filter((period) => period.status === 'open').length;
    const lockedPeriods = periods.filter((period) => period.status === 'locked').length;
    const staleProjects = projects.filter((project) => {
      if (!project.endDate) return false;
      return new Date(project.endDate).getTime() < Date.now() && project.status !== 'completed';
    });

    const recommendations = this.recommendations({
      projectCount: projects.length,
      indicatorCount: indicators.length,
      activityCount: activities.length,
      submittedActivities,
      approvedActivities,
      openPeriods,
      lockedPeriods,
      staleProjectCount: staleProjects.length,
      prompt: dto.message,
    });

    return {
      answer: this.answer(dto.message, {
        projectCount: projects.length,
        indicatorCount: indicators.length,
        activityCount: activities.length,
        submittedActivities,
        approvedActivities,
        openPeriods,
        lockedPeriods,
        staleProjectCount: staleProjects.length,
      }),
      recommendations,
      context: {
        projects: projects.map((project) => ({
          id: project._id.toString(),
          name: project.name,
          status: project.status,
          donor: project.donor,
          endDate: project.endDate,
        })),
        beneficiaries: {
          total:      benStats[0]?.total     ?? 0,
          active:     benStats[0]?.active    ?? 0,
          noConsent:  benStats[0]?.noConsent ?? 0,
          vulnerable: benStats[0]?.vulnerable ?? 0,
        },
        recentActivities: activities.slice(0, 5).map((activity) => ({
          id: activity._id.toString(),
          title: activity.title,
          status: activity.status,
          activityDate: activity.activityDate,
        })),
        reportingPeriods: periods.map((period) => ({
          id: period._id.toString(),
          name: period.name,
          status: period.status,
          startDate: period.startDate,
          endDate: period.endDate,
        })),
      },
    };
  }

  private answer(prompt: string, metrics: Record<string, number>) {
    const lowerPrompt = prompt.toLowerCase();
    const focus = lowerPrompt.includes('report')
      ? 'reporting readiness'
      : lowerPrompt.includes('indicator')
        ? 'indicator performance'
        : lowerPrompt.includes('activity')
          ? 'activity follow-up'
          : 'portfolio health';

    return [
      `I reviewed your ${focus} using the current Evidara  workspace data.`,
      `You have ${metrics.projectCount} project(s), ${metrics.indicatorCount} indicator(s), ${metrics.activityCount} recent activity record(s), and ${metrics.openPeriods} open reporting period(s).`,
      metrics.submittedActivities > 0
        ? `${metrics.submittedActivities} activity record(s) are waiting for review, so approvals are the fastest way to improve report readiness.`
        : 'There are no submitted activities in the recent sample, so the next useful check is whether teams are capturing fresh activity data.',
    ].join(' ');
  }

  private recommendations(metrics: Record<string, number | string>) {
    const recs: string[] = [];

    if (metrics.projectCount === 0) {
      recs.push('Create at least one project before using the copilot for portfolio analysis.');
    }
    if (metrics.indicatorCount === 0) {
      recs.push('Add indicators with baseline and target values so the copilot can reason about progress.');
    }
    if ((metrics.submittedActivities as number) > 0) {
      recs.push('Review submitted activities before calculating reporting period results.');
    }
    if ((metrics.openPeriods as number) > 0) {
      recs.push('Calculate and submit open reporting periods once activity review is complete.');
    }
    if ((metrics.staleProjectCount as number) > 0) {
      recs.push('Check projects past their end date and either close them or update their timeline.');
    }
    if (recs.length === 0) {
      recs.push('Your current sample looks tidy. Ask a focused question about a project, indicator, or reporting period for a deeper check.');
    }

    return recs;
  }
}