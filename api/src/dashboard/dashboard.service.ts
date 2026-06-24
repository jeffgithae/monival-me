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

  // ── Insights & Adaptive Management Engine ───────────────────────────────────
  //
  // Generates actionable, cross-module insights by correlating:
  //   - Grant burn rate vs. indicator progress (financial ↔ programmatic)
  //   - Activity cadence vs. target achievement (operational ↔ M&E)
  //   - Reporting period deadlines vs. data completeness (compliance ↔ quality)
  //
  async insights(organizationId: string, projectId?: string) {

    const orgId = new Types.ObjectId(organizationId);
    const now   = new Date();
    const projectFilter: Record<string, unknown> = { organizationId: orgId };
    if (projectId) projectFilter.projectId = new Types.ObjectId(projectId);

    const grantFilter: Record<string, unknown> = {
      organizationId: orgId,
      status: { $in: ['active', 'pending'] },
    };
    if (projectId) grantFilter.linkedProjects = new Types.ObjectId(projectId);

    const [grants, indicators, activities, periods] = await Promise.all([
      this.grantModel.find(grantFilter).lean(),
      this.indicatorModel.find(projectFilter).lean(),
      this.activityModel
        .find({ ...projectFilter, activityDate: { $gte: new Date(now.getTime() - 90 * 86400000) } })
        .sort({ activityDate: -1 })
        .lean(),
      this.reportingModel
        .find({ ...projectFilter, status: { $in: ['open', 'submitted'] } })
        .lean(),
    ]);

    const insights: Array<{
      type: 'critical' | 'warning' | 'opportunity' | 'info';
      category: string;
      title: string;
      message: string;
      action: string;
      metric?: Record<string, number | string>;
      entityId?: string;
      entityType?: string;
    }> = [];

    // ── 1. Burn rate vs. indicator progress (Financial ↔ Programmatic) ────────
    for (const grant of grants) {
      const burnPct  = grant.amount > 0 ? (grant.amountSpent / grant.amount) * 100 : 0;

      // Find linked indicators and their achievement
      const linkedActivities = activities.filter(
        a => a.grantId?.toString() === grant._id.toString() && a.status === 'approved',
      );
      const linkedIndicatorIds = [...new Set(linkedActivities.map(a => a.indicatorId?.toString()).filter(Boolean))];
      const linkedIndicators   = indicators.filter(i => linkedIndicatorIds.includes(i._id.toString()));

      if (linkedIndicators.length > 0) {
        const avgProgress = linkedIndicators.reduce((sum, ind) => {
          const achieved  = (ind as any).lastAchievedValue ?? 0;
          const targetVal = ind.target ?? 0;
          return sum + (targetVal > 0 ? (achieved / targetVal) * 100 : 0);
        }, 0) / linkedIndicators.length;

        const gap = burnPct - avgProgress;

        if (burnPct > 60 && avgProgress < 30) {
          insights.push({
            type: 'critical',
            category: 'financial_programmatic',
            title: `${grant.name}: High spend, low impact`,
            message: `You have burned ${burnPct.toFixed(0)}% of the ${grant.currency} ${grant.amount.toLocaleString()} grant but only achieved ${avgProgress.toFixed(0)}% of linked indicator targets. A ${gap.toFixed(0)}% efficiency gap warrants urgent review.`,
            action: 'Review linked activities for ${grant.name} and consider pausing spend until targets are on track.',
            metric: { burnRate: Math.round(burnPct), indicatorProgress: Math.round(avgProgress), efficiencyGap: Math.round(gap) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        } else if (gap > 25) {
          insights.push({
            type: 'warning',
            category: 'financial_programmatic',
            title: `${grant.name}: Spend ahead of impact`,
            message: `Grant burn rate (${burnPct.toFixed(0)}%) is ${gap.toFixed(0)} points ahead of indicator progress (${avgProgress.toFixed(0)}%). Ensure financial disbursements translate to measurable outcomes.`,
            action: 'Check whether approved activities are correctly linked to indicators and quantities are recorded.',
            metric: { burnRate: Math.round(burnPct), indicatorProgress: Math.round(avgProgress) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        } else if (avgProgress > 80 && burnPct < 50) {
          insights.push({
            type: 'opportunity',
            category: 'financial_programmatic',
            title: `${grant.name}: Strong impact, budget headroom available`,
            message: `Indicators are at ${avgProgress.toFixed(0)}% while only ${burnPct.toFixed(0)}% of the grant has been spent. Remaining budget could accelerate scale-up.`,
            action: 'Consider allocating remaining grant funds to geographic or demographic expansion.',
            metric: { burnRate: Math.round(burnPct), indicatorProgress: Math.round(avgProgress) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        }
      }

      // Expiry alert
      const daysToExpiry = Math.ceil((new Date(grant.endDate).getTime() - now.getTime()) / 86400000);
      if (daysToExpiry > 0 && daysToExpiry <= 60 && burnPct < 70) {
        insights.push({
          type: 'warning',
          category: 'grant_expiry',
          title: `${grant.name} expires in ${daysToExpiry} days`,
          message: `Only ${burnPct.toFixed(0)}% of this grant has been spent with ${daysToExpiry} days remaining. Remaining funds may be clawed back if unspent.`,
          action: 'Accelerate approved activity implementation or negotiate a no-cost extension.',
          metric: { daysToExpiry, burnRate: Math.round(burnPct) },
          entityId:   grant._id.toString(),
          entityType: 'Grant',
        });
      }
    }

    // ── 2. Indicator progress alerts ──────────────────────────────────────────
    for (const ind of indicators) {
      const achieved  = (ind as any).lastAchievedValue ?? 0;
      const targetVal = ind.target ?? 0;
      if (!targetVal) {
        insights.push({
          type: 'warning',
          category: 'indicator_health',
          title: `Indicator ${ind.code} has no target`,
          message: `Without a life-of-project target, progress cannot be measured for "${ind.title}".`,
          action: 'Set a baseline and target value for this indicator.',
          entityId: ind._id.toString(), entityType: 'Indicator',
        });
        continue;
      }
      const pct = (achieved / targetVal) * 100;
      if (pct < 25 && (ind as any).lastAchievedDate) {
        const daysSince = Math.ceil((now.getTime() - new Date((ind as any).lastAchievedDate).getTime()) / 86400000);
        if (daysSince > 30) {
          insights.push({
            type: 'critical',
            category: 'indicator_health',
            title: `${ind.code}: Critically behind (${pct.toFixed(0)}% achieved)`,
            message: `This indicator is at ${pct.toFixed(0)}% of its target with no update in ${daysSince} days. It may require adaptive intervention.`,
            action: 'Review the data collection plan and approve any pending activities linked to this indicator.',
            metric: { progress: Math.round(pct), daysSinceUpdate: daysSince },
            entityId: ind._id.toString(), entityType: 'Indicator',
          });
        }
      }
    }

    // ── 3. Activity cadence & data collection health ──────────────────────────
    const submittedCount  = activities.filter(a => a.status === 'submitted').length;
    const draftCount      = activities.filter(a => a.status === 'draft').length;
    const missingEvidence = activities.filter(a =>
      a.status === 'approved' && !a.evidenceUrl && !a.evidenceNotes,
    ).length;

    if (submittedCount > 10) {
      insights.push({
        type: 'warning',
        category: 'approvals_backlog',
        title: `${submittedCount} activities awaiting approval`,
        message: `A large approval backlog delays indicator calculations and report readiness. Batch-approve to unblock the data pipeline.`,
        action: 'Use bulk-review to approve pending activities before the next reporting period closes.',
        metric: { submittedCount, draftCount },
      });
    }
    if (missingEvidence > 5) {
      insights.push({
        type: 'info',
        category: 'data_quality',
        title: `${missingEvidence} approved activities lack evidence`,
        message: `These activities are approved but have neither an evidence URL nor evidence notes, which weakens audit trails for donor reports.`,
        action: 'Request field officers to attach photographic or documentary evidence via the activity update form.',
        metric: { missingEvidence },
      });
    }

    // ── 4. Overdue reporting periods ──────────────────────────────────────────
    for (const period of periods) {
      if (period.status === 'open' && new Date(period.endDate) < now) {
        const daysOverdue = Math.ceil((now.getTime() - new Date(period.endDate).getTime()) / 86400000);
        insights.push({
          type: 'critical',
          category: 'reporting_compliance',
          title: `"${period.name}" is ${daysOverdue} days overdue`,
          message: `This reporting period closed on ${new Date(period.endDate).toLocaleDateString()} and has not been submitted. This may breach donor reporting obligations.`,
          action: 'Calculate results, complete the narrative, and submit this reporting period immediately.',
          metric: { daysOverdue },
          entityId: period._id.toString(), entityType: 'ReportingPeriod',
        });
      }
    }

    // Sort: critical → warning → opportunity → info
    const order: Record<string, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
    insights.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));

    return {
      generatedAt: now.toISOString(),
      totalInsights: insights.length,
      critical:    insights.filter(i => i.type === 'critical').length,
      warning:     insights.filter(i => i.type === 'warning').length,
      opportunity: insights.filter(i => i.type === 'opportunity').length,
      info:        insights.filter(i => i.type === 'info').length,
      insights,
    };
  }

  // ── ROI & Cost-per-Impact Calculator ────────────────────────────────────────
  //
  // Bridges grants → activities → indicators to produce a unified financial-
  // programmatic performance table: how much does each unit of impact cost?
  //
  async roi(organizationId: string, projectId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const projectFilter: Record<string, unknown> = { organizationId: orgId };
    if (projectId) projectFilter.projectId = new Types.ObjectId(projectId);

    const [grants, indicators, activityRollup] = await Promise.all([
      this.grantModel.find({
        organizationId: orgId,
        ...(projectId ? { linkedProjects: new Types.ObjectId(projectId) } : {}),
      }).lean(),

      this.indicatorModel.find(projectFilter).lean(),

      // Roll up cost + quantity per indicator from approved activities
      this.activityModel.aggregate([
        { $match: { ...projectFilter, status: 'approved', indicatorId: { $exists: true } } },
        {
          $group: {
            _id:           '$indicatorId',
            totalCost:     { $sum: { $ifNull: ['$cost', 0] } },
            totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } },
            activityCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Build lookup maps
    const rollupMap = new Map(activityRollup.map((r: any) => [r._id.toString(), r]));

    // Grant financials by project
    const totalGrantAmount = grants.reduce((s, g) => s + (g.amount ?? 0), 0);
    const totalGrantSpent  = grants.reduce((s, g) => s + (g.amountSpent ?? 0), 0);

    // Per-indicator ROI
    const indicatorROI = indicators.map(ind => {
      const rollup      = rollupMap.get(ind._id.toString());
      const achieved    = (ind as any).lastAchievedValue ?? rollup?.totalQuantity ?? 0;
      const totalCost   = rollup?.totalCost ?? 0;
      const targetVal   = ind.target ?? 0;
      const progressPct = targetVal > 0 ? Math.round((achieved / targetVal) * 100) : null;
      const costPerUnit  = achieved > 0 && totalCost > 0 ? Math.round(totalCost / achieved) : null;
      const remainingGap = targetVal > 0 ? Math.max(0, targetVal - achieved) : null;

      // Extrapolated cost to reach target based on current cost-per-unit
      const projectedCostToTarget = costPerUnit && remainingGap
        ? Math.round(costPerUnit * remainingGap)
        : null;

      return {
        indicatorId:   ind._id.toString(),
        code:          ind.code,
        title:         ind.title,
        unit:          ind.unit ?? 'units',
        level:         ind.level,
        target:        targetVal,
        achieved,
        progressPct,
        activityCount: rollup?.activityCount ?? 0,
        totalCost,
        costPerUnit,
        remainingGap,
        projectedCostToTarget,
        efficiency:    progressPct && progressPct > 0
          ? progressPct >= 80 ? 'high' : progressPct >= 50 ? 'medium' : 'low'
          : 'no_data',
      };
    }).sort((a, b) => (a.costPerUnit ?? Infinity) - (b.costPerUnit ?? Infinity));

    // Portfolio-level summary
    const totalAchievedUnits = indicatorROI.reduce((s, i) => s + i.achieved, 0);
    const portfolioCostPerUnit = totalAchievedUnits > 0 && totalGrantSpent > 0
      ? Math.round(totalGrantSpent / totalAchievedUnits)
      : null;

    const efficiency = {
      high:   indicatorROI.filter(i => i.efficiency === 'high').length,
      medium: indicatorROI.filter(i => i.efficiency === 'medium').length,
      low:    indicatorROI.filter(i => i.efficiency === 'low').length,
      noData: indicatorROI.filter(i => i.efficiency === 'no_data').length,
    };

    return {
      generatedAt: new Date().toISOString(),
      portfolio: {
        grantCount:          grants.length,
        totalGrantAmount,
        totalGrantSpent,
        burnRatePct:         totalGrantAmount > 0 ? Math.round((totalGrantSpent / totalGrantAmount) * 100) : 0,
        totalAchievedUnits,
        portfolioCostPerUnit,
        currency:            grants[0]?.currency ?? 'USD',
      },
      efficiency,
      indicators: indicatorROI,
    };
  }
}