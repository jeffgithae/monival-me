import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../activities/schemas/activity.schema';
import { Beneficiary } from '../beneficiaries/schemas/beneficiary.schema';
import { Grant } from '../grants/schemas/grant.schema';
import { ImpactStory } from '../impact-stories/schemas/impact-story.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Project } from '../projects/schemas/project.schema';
import { ReportingPeriod } from '../reporting/schemas/reporting-period.schema';
import { IndicatorResult } from '../reporting/schemas/indicator-result.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Project.name)            private readonly projectModel:       Model<Project>,
    @InjectModel(Indicator.name)          private readonly indicatorModel:     Model<Indicator>,
    @InjectModel(IndicatorResult.name)    private readonly resultModel:        Model<IndicatorResult>,
    @InjectModel(Activity.name)           private readonly activityModel:      Model<Activity>,
    @InjectModel(OrganizationMember.name) private readonly memberModel:        Model<OrganizationMember>,
    @InjectModel(Organization.name)       private readonly orgModel:           Model<Organization>,
    @InjectModel(Beneficiary.name)        private readonly beneficiaryModel:   Model<Beneficiary>,
    @InjectModel(Grant.name)              private readonly grantModel:         Model<Grant>,
    @InjectModel(ReportingPeriod.name)    private readonly reportingModel:     Model<ReportingPeriod>,
    @InjectModel(ImpactStory.name)        private readonly impactStoryModel:   Model<ImpactStory>,
  ) {}

  async overview(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const now   = new Date();
    const thirtyDaysAgo  = new Date(now.getTime() - 30  * 86400000);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── 1. Parallel top-level counts ────────────────────────────────────────
    const [
      projectCount,
      indicatorCount,
      activityCount,
      memberCount,
      recentActivities,
      allProjects,
      beneficiaryStats,
      grantSummary,
      reportingPeriods,
      impactStoryCount,
      impactStoriesThisMonth,
    ] = await Promise.all([
      this.projectModel.countDocuments({ organizationId: orgId }),
      this.indicatorModel.countDocuments({ organizationId: orgId }),
      this.activityModel.countDocuments({ organizationId: orgId }),
      this.memberModel.countDocuments({ organizationId: orgId, status: 'active' }),

      // Recent activities (all statuses, last 5)
      this.activityModel
        .find({ organizationId: orgId })
        .sort({ activityDate: -1 })
        .limit(5)
        .select('title activityDate status projectId')
        .lean(),

      // ALL projects (not just active) for health calculation
      this.projectModel
        .find({ organizationId: orgId })
        .select('name donor status startDate endDate')
        .lean(),

      // Beneficiary aggregate
      this.beneficiaryModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: {
          _id:       null,
          total:     { $sum: 1 },
          active:    { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          female:    { $sum: { $cond: [{ $eq: ['$sex', 'female'] }, 1, 0] } },
          isIdp:     { $sum: { $cond: ['$isIdp', 1, 0] } },
          isRefugee: { $sum: { $cond: ['$isRefugee', 1, 0] } },
          hasDisability: { $sum: { $cond: ['$hasDisability', 1, 0] } },
          noConsent: { $sum: { $cond: [{ $ne: ['$consentGiven', true] }, 1, 0] } },
          totalHH:   { $sum: { $ifNull: ['$householdSize', 1] } },
        }},
      ]),

      // Grant financial summary
      this.grantModel.aggregate([
        { $match: { organizationId: orgId, status: { $in: ['active', 'pending'] } } },
        { $group: {
          _id:          null,
          totalAmount:  { $sum: '$amount' },
          totalSpent:   { $sum: '$amountSpent' },
          count:        { $sum: 1 },
          endingSoon:   { $sum: { $cond: [
            { $and: [
              { $gte: ['$endDate', now] },
              { $lte: ['$endDate', new Date(now.getTime() + 60 * 86400000)] },
            ]},
            1, 0,
          ]}},
        }},
      ]),

      // Reporting periods — open/overdue
      this.reportingModel
        .find({ organizationId: orgId, status: { $in: ['open', 'submitted'] } })
        .select('name status endDate projectId')
        .lean(),

      // Impact story count
      this.impactStoryModel.countDocuments({ organizationId: orgId }),

      // Impact stories created this month
      this.impactStoryModel.countDocuments({
        organizationId: orgId,
        createdAt: { $gte: thisMonthStart },
      }),
    ]);

    // ── 2. Indicator achievement across portfolio ────────────────────────────
    // Use IndicatorResult (approved/submitted) as source of truth for progress
    const [indicators, allResults] = await Promise.all([
      this.indicatorModel
        .find({ organizationId: orgId })
        .select('target baseline achieved projectId')
        .lean<Array<{ _id: any; target: number; baseline: number; achieved?: number; projectId: any }>>(),
      this.resultModel
        .find({ organizationId: orgId, status: { $in: ['approved', 'submitted'] } })
        .select('indicatorId achieved')
        .lean(),
    ]);

    // Sum achieved per indicator from results
    const achievedByIndicator = new Map<string, number>();
    for (const r of allResults) {
      const key = r.indicatorId.toString();
      achievedByIndicator.set(key, (achievedByIndicator.get(key) ?? 0) + r.achieved);
    }

    const indicatorAchievement = { onTarget: 0, atRisk: 0, critical: 0, noData: 0 };
    for (const ind of indicators) {
      const achieved = achievedByIndicator.get(ind._id.toString()) ?? ind.achieved ?? 0;
      if (!ind.target) { indicatorAchievement.noData++; continue; }
      const pct = (achieved / ind.target) * 100;
      if (pct >= 80)       indicatorAchievement.onTarget++;
      else if (pct >= 50)  indicatorAchievement.atRisk++;
      else if (pct < 50 && achieved > 0) indicatorAchievement.critical++;
      else                 indicatorAchievement.noData++;
    }

    // ── 3. Per-project health (exclude completed/archived) ───────────────────
    const activeProjects = allProjects.filter(p => !['completed', 'archived', 'cancelled'].includes(p.status));
    const projectIds = activeProjects.map(p => p._id);

    const [indicatorsByProject, activitiesByProject] = await Promise.all([
      this.indicatorModel.aggregate([
        { $match: { organizationId: orgId, projectId: { $in: projectIds } } },
        { $group: { _id: '$projectId', count: { $sum: 1 } } },
      ]),
      this.activityModel.aggregate([
        { $match: { organizationId: orgId, projectId: { $in: projectIds }, status: { $in: ['approved', 'submitted', 'draft'] } } },
        { $group: { _id: '$projectId', lastActivity: { $max: '$activityDate' }, count: { $sum: 1 } } },
      ]),
    ]);

    // Also get latest indicator result per project
    const resultsByProject = await this.resultModel.aggregate([
      { $match: { organizationId: orgId, projectId: { $in: projectIds } } },
      { $group: { _id: '$projectId', lastResult: { $max: '$createdAt' }, count: { $sum: 1 } } },
    ]);

    const indicatorMap   = new Map(indicatorsByProject.map(i => [i._id.toString(), i.count]));
    const activityMap    = new Map(activitiesByProject.map(i => [i._id.toString(), i]));
    const resultMap      = new Map(resultsByProject.map(i => [i._id.toString(), i]));

    const health = { onTrack: 0, atRisk: 0, behind: 0, noBaseline: 0 };
    const qualityAlerts: Array<{
      projectId?: string; title: string; message: string; severity: 'critical' | 'warning' | 'info';
    }> = [];

    for (const project of activeProjects) {
      const pid            = project._id.toString();
      const indCount       = indicatorMap.get(pid) ?? 0;
      const actSummary     = activityMap.get(pid);
      const resultSummary  = resultMap.get(pid);
      const lastActivity   = actSummary?.lastActivity   ? new Date(actSummary.lastActivity)   : null;
      const lastResult     = resultSummary?.lastResult  ? new Date(resultSummary.lastResult)  : null;
      const daysSinceActivity = lastActivity ? Math.ceil((now.getTime() - lastActivity.getTime()) / 86400000) : null;
      const daysSinceResult   = lastResult   ? Math.ceil((now.getTime() - lastResult.getTime())   / 86400000) : null;

      if (!indCount) {
        health.noBaseline++;
        qualityAlerts.push({ projectId: pid, title: project.name, message: 'No indicators defined.', severity: 'critical' });
      } else if (!resultSummary && !actSummary) {
        health.behind++;
        qualityAlerts.push({ projectId: pid, title: project.name, message: 'No activity or indicator data captured yet.', severity: 'warning' });
      } else if ((daysSinceActivity ?? 999) > 60 && (daysSinceResult ?? 999) > 60) {
        health.behind++;
        qualityAlerts.push({ projectId: pid, title: project.name, message: `No updates in ${Math.min(daysSinceActivity ?? 999, daysSinceResult ?? 999)} days — data may be stale.`, severity: 'warning' });
      } else if (resultSummary && (daysSinceResult ?? 999) > 45) {
        health.atRisk++;
        qualityAlerts.push({ projectId: pid, title: project.name, message: `Indicator results not updated in ${daysSinceResult} days.`, severity: 'info' });
      } else if ((daysSinceActivity ?? 999) > 30) {
        health.atRisk++;
        qualityAlerts.push({ projectId: pid, title: project.name, message: `No activity logged in ${daysSinceActivity} days.`, severity: 'info' });
      } else {
        health.onTrack++;
      }

      // Overdue end date alert
      if (project.endDate && new Date(project.endDate) < now) {
        qualityAlerts.push({ projectId: pid, title: project.name, message: 'Project end date has passed — verify completion status.', severity: 'warning' });
      }
    }

    // ── 4. Reporting period status ───────────────────────────────────────────
    const overdueReports  = reportingPeriods.filter(r => r.status === 'open' && new Date(r.endDate) < now);
    const openReports     = reportingPeriods.filter(r => r.status === 'open' && new Date(r.endDate) >= now);
    const submittedReports = reportingPeriods.filter(r => r.status === 'submitted');

    // Alert for overdue reports
    for (const r of overdueReports.slice(0, 3)) {
      qualityAlerts.push({
        title: r.name,
        message: `Reporting period overdue — was due ${new Date(r.endDate).toLocaleDateString()}.`,
        severity: 'critical',
      });
    }

    // No-consent alert
    const bStats = beneficiaryStats[0];
    if (bStats?.noConsent > 0 && bStats.total > 0) {
      const pct = Math.round((bStats.noConsent / bStats.total) * 100);
      if (pct > 20) {
        qualityAlerts.push({
          title: 'Consent gap',
          message: `${pct}% of beneficiaries (${bStats.noConsent}) have no consent on file.`,
          severity: pct > 40 ? 'critical' : 'warning',
        });
      }
    }

    // ── 5. Project status breakdown (all projects) ───────────────────────────
    const statusCounts: Record<string, number> = {};
    for (const p of allProjects) {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
    }

    // ── 6. Grants financial ──────────────────────────────────────────────────
    const grantData = grantSummary[0] ?? { totalAmount: 0, totalSpent: 0, count: 0, endingSoon: 0 };
    const burnRate  = grantData.totalAmount > 0
      ? Math.round((grantData.totalSpent / grantData.totalAmount) * 100)
      : 0;

    return {
      counts: {
        projects:        projectCount,
        indicators:      indicatorCount,
        activities:      activityCount,
        members:         memberCount,
        pendingApprovals: await this.activityModel.countDocuments({ organizationId: orgId, status: 'submitted' }),
        beneficiaries:   bStats?.total ?? 0,
        grants:          grantData.count,
        impactStories:   impactStoryCount,
      },

      activeProjects: allProjects
        .filter(p => p.status === 'active')
        .slice(0, 6),

      projectStatusCounts: statusCounts,

      recentActivities: recentActivities.map(a => ({
        id:           a._id.toString(),
        title:        a.title,
        activityDate: a.activityDate,
        status:       a.status,
        projectId:    a.projectId.toString(),
      })),

      health,
      qualityAlerts: qualityAlerts.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      }),

      indicatorAchievement,

      beneficiaries: {
        total:         bStats?.total        ?? 0,
        active:        bStats?.active       ?? 0,
        female:        bStats?.female       ?? 0,
        femalePct:     bStats?.total > 0 ? Math.round((bStats.female / bStats.total) * 100) : 0,
        vulnerable:    (bStats?.isIdp ?? 0) + (bStats?.isRefugee ?? 0) + (bStats?.hasDisability ?? 0),
        noConsent:     bStats?.noConsent    ?? 0,
        totalHHMembers: bStats?.totalHH     ?? 0,
      },

      grants: {
        totalAmount:   grantData.totalAmount,
        totalSpent:    grantData.totalSpent,
        burnRate,
        count:         grantData.count,
        endingSoon:    grantData.endingSoon,
      },

      reporting: {
        overdue:   overdueReports.length,
        open:      openReports.length,
        submitted: submittedReports.length,
        overdueList: overdueReports.slice(0, 3).map(r => ({
          id:      r._id.toString(),
          name:    r.name,
          endDate: r.endDate,
        })),
      },

      impactStories: {
        total:      impactStoryCount,
        thisMonth:  impactStoriesThisMonth,
      },
    };
  }
}