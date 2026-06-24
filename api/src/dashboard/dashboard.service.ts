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
        .find({ ...projectFilter, activityDate: { $gte: new Date(now.getTime() - 180 * 86400000) } })
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

    // Helper: resolve achieved value from either field
    const getAchieved = (ind: any): number =>
      ind.achieved ?? ind.lastAchievedValue ?? 0;

    // ── 1. Grant health alerts ─────────────────────────────────────────────────
    for (const grant of grants) {
      const amount     = grant.amount ?? 0;
      const spent      = grant.amountSpent ?? 0;
      const burnPct    = amount > 0 ? (spent / amount) * 100 : 0;
      const currency   = grant.currency ?? 'USD';

      // Expiry alert — 90 days window (was 60)
      if (grant.endDate) {
        const daysToExpiry = Math.ceil((new Date(grant.endDate).getTime() - now.getTime()) / 86400000);
        if (daysToExpiry > 0 && daysToExpiry <= 90 && burnPct < 80) {
          insights.push({
            type: daysToExpiry <= 30 ? 'critical' : 'warning',
            category: 'grant_expiry',
            title: `${grant.name} expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`,
            message: `Only ${burnPct.toFixed(0)}% of the ${currency} ${amount.toLocaleString()} grant has been spent with ${daysToExpiry} days remaining. Unspent funds may need to be returned.`,
            action: 'Accelerate approved activity implementation or negotiate a no-cost extension.',
            metric: { daysToExpiry, burnRate: Math.round(burnPct) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        }
        // Already expired but still active
        if (daysToExpiry <= 0 && grant.status === 'active') {
          insights.push({
            type: 'critical',
            category: 'grant_expiry',
            title: `${grant.name} has expired`,
            message: `This grant expired ${Math.abs(daysToExpiry)} days ago but is still marked active. Confirm final disbursement status with your donor.`,
            action: 'Close the grant or update its status in the Grants module.',
            metric: { burnRate: Math.round(burnPct) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        }
      }

      // Zero spend on active grant
      if (burnPct === 0 && grant.status === 'active') {
        insights.push({
          type: 'info',
          category: 'grant_utilisation',
          title: `${grant.name}: No spend recorded yet`,
          message: `This active grant (${currency} ${amount.toLocaleString()}) has ${burnPct.toFixed(0)}% utilisation. If implementation has begun, record expenditure to track burn rate.`,
          action: 'Update amountSpent in the Grants module or link approved activities to this grant.',
          entityId:   grant._id.toString(),
          entityType: 'Grant',
        });
      }

      // Find linked indicators via activities
      const linkedActivities = activities.filter(
        a => a.grantId?.toString() === grant._id.toString() && a.status === 'approved',
      );
      const linkedIndicatorIds = [...new Set(linkedActivities.map(a => a.indicatorId?.toString()).filter(Boolean))];
      const linkedIndicators   = indicators.filter(i => linkedIndicatorIds.includes(i._id.toString()));

      if (linkedIndicators.length > 0) {
        const avgProgress = linkedIndicators.reduce((sum, ind) => {
          const achieved  = getAchieved(ind);
          const targetVal = ind.target ?? 0;
          return sum + (targetVal > 0 ? (achieved / targetVal) * 100 : 0);
        }, 0) / linkedIndicators.length;

        const gap = burnPct - avgProgress;

        if (burnPct > 50 && avgProgress < 25) {
          insights.push({
            type: 'critical',
            category: 'financial_programmatic',
            title: `${grant.name}: High spend, low impact`,
            message: `You have burned ${burnPct.toFixed(0)}% of the ${currency} ${amount.toLocaleString()} grant but achieved only ${avgProgress.toFixed(0)}% of linked indicator targets. A ${gap.toFixed(0)}% efficiency gap warrants urgent review.`,
            action: `Review linked activities for ${grant.name} and ensure quantity data is recorded.`,
            metric: { burnRate: Math.round(burnPct), indicatorProgress: Math.round(avgProgress), efficiencyGap: Math.round(gap) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        } else if (gap > 20) {
          insights.push({
            type: 'warning',
            category: 'financial_programmatic',
            title: `${grant.name}: Spend ahead of impact`,
            message: `Grant burn rate (${burnPct.toFixed(0)}%) is ${gap.toFixed(0)} points ahead of linked indicator progress (${avgProgress.toFixed(0)}%). Ensure disbursements translate to measurable outcomes.`,
            action: 'Check that approved activities are linked to indicators and quantities are recorded.',
            metric: { burnRate: Math.round(burnPct), indicatorProgress: Math.round(avgProgress) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        } else if (avgProgress > 75 && burnPct < 60) {
          insights.push({
            type: 'opportunity',
            category: 'financial_programmatic',
            title: `${grant.name}: Strong impact, budget headroom available`,
            message: `Indicators are at ${avgProgress.toFixed(0)}% of target while only ${burnPct.toFixed(0)}% of the grant has been spent. Remaining budget could accelerate scale-up.`,
            action: 'Consider allocating remaining grant funds to geographic or demographic expansion.',
            metric: { burnRate: Math.round(burnPct), indicatorProgress: Math.round(avgProgress) },
            entityId:   grant._id.toString(),
            entityType: 'Grant',
          });
        }
      }
    }

    // ── 2. Indicator progress alerts ──────────────────────────────────────────
    let noBaselineCount = 0;
    let zeroProgressCount = 0;

    for (const ind of indicators) {
      const achieved  = getAchieved(ind);
      const targetVal = ind.target ?? 0;

      if (!targetVal) {
        noBaselineCount++;
        continue;
      }

      const pct = (achieved / targetVal) * 100;

      if (achieved === 0) {
        zeroProgressCount++;
      } else if (pct < 25) {
        const lastDate = (ind as any).lastAchievedDate ?? (ind as any).updatedAt;
        const daysSince = lastDate
          ? Math.ceil((now.getTime() - new Date(lastDate).getTime()) / 86400000)
          : null;
        insights.push({
          type: 'warning',
          category: 'indicator_health',
          title: `${ind.code}: Behind target (${pct.toFixed(0)}% achieved)`,
          message: `"${ind.title}" is at ${pct.toFixed(0)}% of its target of ${targetVal} ${ind.unit ?? ''}${daysSince !== null ? `, with no update in ${daysSince} days` : ''}.`,
          action: 'Approve pending activities linked to this indicator or review the data collection plan.',
          metric: { progress: Math.round(pct), ...(daysSince !== null ? { daysSinceUpdate: daysSince } : {}) },
          entityId: ind._id.toString(), entityType: 'Indicator',
        });
      } else if (pct >= 100) {
        insights.push({
          type: 'opportunity',
          category: 'indicator_health',
          title: `${ind.code}: Target achieved`,
          message: `"${ind.title}" has reached ${pct.toFixed(0)}% of its target. Consider setting a stretch target or scaling the intervention.`,
          action: 'Review whether a higher target or geographic expansion is feasible.',
          entityId: ind._id.toString(), entityType: 'Indicator',
        });
      }
    }

    if (noBaselineCount > 0) {
      insights.push({
        type: 'warning',
        category: 'indicator_health',
        title: `${noBaselineCount} indicator${noBaselineCount > 1 ? 's have' : ' has'} no target set`,
        message: `Without life-of-project targets, progress cannot be measured or reported to donors.`,
        action: 'Set baseline and target values for all indicators in the Indicators module.',
      });
    }

    if (zeroProgressCount > 0) {
      insights.push({
        type: 'info',
        category: 'indicator_health',
        title: `${zeroProgressCount} indicator${zeroProgressCount > 1 ? 's have' : ' has'} zero achievement recorded`,
        message: `These indicators have a target but no achieved value. If implementation has begun, run Calculate Results in a reporting period.`,
        action: 'Open an active reporting period and use Calculate Results to update achievements.',
      });
    }

    // ── 3. Activity cadence & data collection health ──────────────────────────
    const submittedCount  = activities.filter(a => a.status === 'submitted').length;
    const draftCount      = activities.filter(a => a.status === 'draft').length;
    const missingEvidence = activities.filter(a =>
      a.status === 'approved' && !a.evidenceUrl && !a.evidenceNotes,
    ).length;
    const approvedCount   = activities.filter(a => a.status === 'approved').length;

    if (submittedCount >= 1) {
      insights.push({
        type: submittedCount >= 5 ? 'warning' : 'info',
        category: 'approvals_backlog',
        title: `${submittedCount} ${submittedCount === 1 ? 'activity' : 'activities'} awaiting approval`,
        message: `Unapproved activities are excluded from indicator calculations and donor reports. ${draftCount > 0 ? `${draftCount} additional draft(s) are not yet submitted.` : ''}`,
        action: 'Use bulk-review to approve pending activities before the next reporting period closes.',
        metric: { submittedCount, draftCount },
      });
    }

    if (draftCount >= 3 && submittedCount === 0) {
      insights.push({
        type: 'info',
        category: 'approvals_backlog',
        title: `${draftCount} activities stuck in draft`,
        message: `These activities have not been submitted for review and will not count toward any indicators or reports.`,
        action: 'Submit draft activities for approval when data entry is complete.',
        metric: { draftCount },
      });
    }

    if (missingEvidence >= 1) {
      insights.push({
        type: 'info',
        category: 'data_quality',
        title: `${missingEvidence} approved ${missingEvidence === 1 ? 'activity lacks' : 'activities lack'} evidence`,
        message: `Approved activities without evidence URLs or notes weaken audit trails for donor reports.`,
        action: 'Request field officers to attach photographic or documentary evidence via the activity update form.',
        metric: { missingEvidence, approvedCount },
      });
    }

    // No activities in 30 days
    const recentActivities = activities.filter(
      a => new Date(a.activityDate).getTime() > now.getTime() - 30 * 86400000,
    );
    if (activities.length > 0 && recentActivities.length === 0) {
      insights.push({
        type: 'warning',
        category: 'activity_cadence',
        title: 'No activities recorded in the last 30 days',
        message: 'Implementation appears to have stalled. If activities are ongoing, ensure field officers are logging them.',
        action: 'Check with field teams and log any recent activities. Unapproved activities do not count.',
      });
    }

    // ── 4. Overdue reporting periods ──────────────────────────────────────────
    for (const period of periods) {
      if (period.status === 'open' && new Date(period.endDate) < now) {
        const daysOverdue = Math.ceil((now.getTime() - new Date(period.endDate).getTime()) / 86400000);
        insights.push({
          type: 'critical',
          category: 'reporting_compliance',
          title: `"${period.name}" is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`,
          message: `This reporting period closed on ${new Date(period.endDate).toLocaleDateString()} and has not been submitted. This may breach donor reporting obligations.`,
          action: 'Calculate results, complete the narrative, and submit this reporting period immediately.',
          metric: { daysOverdue },
          entityId: period._id.toString(), entityType: 'ReportingPeriod',
        });
      }
      // Approaching deadline — 14 days
      if (period.status === 'open' && period.endDate) {
        const daysToClose = Math.ceil((new Date(period.endDate).getTime() - now.getTime()) / 86400000);
        if (daysToClose > 0 && daysToClose <= 14) {
          insights.push({
            type: 'warning',
            category: 'reporting_compliance',
            title: `"${period.name}" closes in ${daysToClose} day${daysToClose === 1 ? '' : 's'}`,
            message: `Ensure all activities are approved and results are calculated before the reporting period closes.`,
            action: 'Review pending activities and run Calculate Results before the deadline.',
            metric: { daysToClose },
            entityId: period._id.toString(), entityType: 'ReportingPeriod',
          });
        }
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