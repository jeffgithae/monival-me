import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity } from '../../activities/schemas/activity.schema';
import { Indicator } from '../../indicators/schemas/indicator.schema';
import { Project } from '../../projects/schemas/project.schema';
import { ReportingPeriod } from '../../reporting/schemas/reporting-period.schema';
import { IndicatorResult } from '../../reporting/schemas/indicator-result.schema';
import { Beneficiary } from '../../beneficiaries/schemas/beneficiary.schema';
import { Grant } from '../../grants/schemas/grant.schema';
import { StakeholderFeedback } from '../../stakeholder-feedback/schemas/stakeholder-feedback.schema';
import { CopilotMessageDto } from './dto/copilot-message.dto';

// ── Report Drafter DTO ───────────────────────────────────────────────────────
export interface DraftReportDto {
  reportingPeriodId: string;
  style?: 'narrative' | 'bullet' | 'executive';
  includeFinancials?: boolean;
  includeFeedback?: boolean;
}

@Injectable()
export class CopilotService {
  constructor(
    @InjectModel(Project.name)            private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name)          private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name)           private readonly activityModel: Model<Activity>,
    @InjectModel(ReportingPeriod.name)    private readonly reportingPeriodModel: Model<ReportingPeriod>,
    @InjectModel(IndicatorResult.name)    private readonly resultModel: Model<IndicatorResult>,
    @InjectModel(Beneficiary.name)        private readonly beneficiaryModel: Model<Beneficiary>,
    @InjectModel(Grant.name)              private readonly grantModel: Model<Grant>,
    @InjectModel(StakeholderFeedback.name) private readonly feedbackModel: Model<StakeholderFeedback>,
  ) {}

  // ─── Copilot Message (Q&A) ─────────────────────────────────────────────────

  async message(organizationId: string, dto: CopilotMessageDto) {
    const orgId = new Types.ObjectId(organizationId);
    const projectFilter = dto.projectId
      ? { organizationId: orgId, _id: new Types.ObjectId(dto.projectId) }
      : { organizationId: orgId };
    const actFilter = dto.projectId
      ? { organizationId: orgId, projectId: new Types.ObjectId(dto.projectId) }
      : { organizationId: orgId };

    const [projects, indicators, activities, periods, benStats, grantSummary] = await Promise.all([
      this.projectModel.find(projectFilter).sort({ createdAt: -1 }).limit(8).lean(),
      this.indicatorModel.find(actFilter).sort({ code: 1 }).limit(20).lean(),
      this.activityModel.find(actFilter).sort({ activityDate: -1 }).limit(20).lean(),
      this.reportingPeriodModel.find(actFilter).sort({ endDate: -1 }).limit(8).lean(),
      this.beneficiaryModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: {
          _id: null,
          total:      { $sum: 1 },
          active:     { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          noConsent:  { $sum: { $cond: ['$consentGiven', 0, 1] } },
          vulnerable: { $sum: { $cond: [{ $or: [
            '$isIdp', '$isRefugee', '$hasDisability',
            '$isFemaleHeadedHousehold', '$isOrphan', '$isChronicallyIll', '$isElderly',
          ]}, 1, 0] } },
        }},
      ]),
      this.grantModel.aggregate([
        { $match: { organizationId: orgId, status: { $in: ['active', 'pending'] } } },
        { $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalSpent:  { $sum: '$amountSpent' },
          count: { $sum: 1 },
        }},
      ]),
    ]);

    const submittedActivities = activities.filter(a => a.status === 'submitted').length;
    const approvedActivities  = activities.filter(a => a.status === 'approved').length;
    const openPeriods         = periods.filter(p => p.status === 'open').length;
    const staleProjects       = projects.filter(p =>
      p.endDate && new Date(p.endDate).getTime() < Date.now() && p.status !== 'completed',
    );
    const grants = grantSummary[0] ?? { totalAmount: 0, totalSpent: 0, count: 0 };
    const burnRate = grants.totalAmount > 0
      ? Math.round((grants.totalSpent / grants.totalAmount) * 100)
      : 0;

    const indicatorHealth = indicators.map(ind => {
      const achieved  = (ind as any).lastAchievedValue ?? 0;
      const target    = ind.target ?? 0;
      const pct       = target > 0 ? Math.round((achieved / target) * 100) : 0;
      return { code: ind.code, pct, achieved, target };
    });
    const avgIndicatorProgress = indicatorHealth.length > 0
      ? Math.round(indicatorHealth.reduce((s, i) => s + i.pct, 0) / indicatorHealth.length)
      : 0;

    const metrics = {
      projectCount: projects.length,
      indicatorCount: indicators.length,
      activityCount: activities.length,
      submittedActivities,
      approvedActivities,
      openPeriods,
      staleProjectCount: staleProjects.length,
      burnRate,
      avgIndicatorProgress,
      grantCount: grants.count,
    };

    const recommendations = this.recommendations(metrics);
    const answer          = this.answer(dto.message, metrics, indicatorHealth);

    return {
      answer,
      recommendations,
      context: {
        projects: projects.map(p => ({ id: p._id.toString(), name: p.name, status: p.status, donor: p.donor, endDate: p.endDate })),
        beneficiaries: {
          total:      benStats[0]?.total      ?? 0,
          active:     benStats[0]?.active     ?? 0,
          noConsent:  benStats[0]?.noConsent  ?? 0,
          vulnerable: benStats[0]?.vulnerable ?? 0,
        },
        grants: {
          count:        grants.count,
          totalAmount:  grants.totalAmount,
          totalSpent:   grants.totalSpent,
          burnRatePct:  burnRate,
        },
        indicators: indicatorHealth,
        recentActivities: activities.slice(0, 5).map(a => ({
          id: a._id.toString(), title: a.title, status: a.status, activityDate: a.activityDate,
        })),
        reportingPeriods: periods.map(p => ({
          id: p._id.toString(), name: p.name, status: p.status, startDate: p.startDate, endDate: p.endDate,
        })),
      },
    };
  }

  // ─── AI Donor Report Drafter ───────────────────────────────────────────────
  //
  // Aggregates all data for a reporting period — indicators, activities,
  // financial summary, stakeholder feedback — then synthesises a structured
  // first-draft donor report the user can edit and submit.
  //
  async draftReport(organizationId: string, dto: DraftReportDto): Promise<{
    reportingPeriodId: string;
    generatedAt: string;
    style: string;
    report: {
      title: string;
      executiveSummary: string;
      indicatorPerformance: string;
      activitiesNarrative: string;
      challengesAndLessons: string;
      financialSummary?: string;
      stakeholderVoice?: string;
      nextPeriodPlans: string;
      qualityFlags: string[];
    };
    rawData: Record<string, unknown>;
  }> {
    const orgId    = new Types.ObjectId(organizationId);
    const periodId = new Types.ObjectId(dto.reportingPeriodId);
    const style    = dto.style ?? 'narrative';

    // ── Gather all data in a single parallel batch ─────────────────────────
    const [period, results, activities, grants, feedback] = await Promise.all([
      this.reportingPeriodModel.findOne({ _id: periodId, organizationId: orgId }).lean(),

      this.resultModel
        .find({ reportingPeriodId: periodId, organizationId: orgId })
        .populate('indicatorId')
        .lean(),

      this.activityModel
        .find({
          organizationId: orgId,
          status: 'approved',
          activityDate: {
            $gte: period ? new Date((period as any).startDate) : new Date(0),
            $lte: period ? new Date((period as any).endDate)   : new Date(),
          },
        })
        .lean()
        .catch(() => []),

      dto.includeFinancials !== false
        ? this.grantModel
            .find({ organizationId: orgId, status: { $in: ['active', 'pending'] } })
            .lean()
        : Promise.resolve([]),

      dto.includeFeedback !== false
        ? this.feedbackModel
            .find({
              organizationId: orgId,
              ...(period ? { projectId: (period as any).projectId } : {}),
              createdAt: {
                $gte: period ? new Date((period as any).startDate) : new Date(0),
                $lte: period ? new Date((period as any).endDate)   : new Date(),
              },
            })
            .sort({ sentimentScore: -1 })
            .limit(5)
            .lean()
        : Promise.resolve([]),
    ]);

    if (!period) {
      throw new Error('Reporting period not found.');
    }

    // ── Fetch activities (period data was needed above for dates) ──────────
    const approvedActivities = await this.activityModel
      .find({
        organizationId: orgId,
        status: 'approved',
        activityDate: { $gte: new Date(period.startDate), $lte: new Date(period.endDate) },
        ...(period.projectId ? { projectId: period.projectId } : {}),
      })
      .lean();

    // ── Build sections ─────────────────────────────────────────────────────
    const totalParticipants = approvedActivities.reduce((s, a) => s + (a.participants ?? 0), 0);
    const totalQuantity     = approvedActivities.reduce((s, a) => s + (a.quantity ?? 0), 0);
    const onTarget          = results.filter(r => {
      const ind    = (r as any).indicatorId as any;
      const target = ind?.target ?? 0;
      return target > 0 && r.achieved >= target * 0.8;
    }).length;
    const atRisk   = results.filter(r => {
      const ind    = (r as any).indicatorId as any;
      const target = ind?.target ?? 0;
      return target > 0 && r.achieved < target * 0.5;
    }).length;

    const qualityFlags: string[] = [];
    if (results.length === 0)       qualityFlags.push('No indicator results have been calculated for this period. Run calculateResults first.');
    if (approvedActivities.length === 0) qualityFlags.push('No approved activities found in this date range.');
    if (atRisk > 0)                 qualityFlags.push(`${atRisk} indicator(s) are below 50% of target — narrative should address reasons.`);
    if (period.status !== 'submitted' && period.status !== 'approved') {
      qualityFlags.push('Reporting period is not yet submitted — this draft is based on current data.');
    }

    // Indicator performance section
    const indRows = results.map(r => {
      const ind    = (r as any).indicatorId as any;
      const target = ind?.target ?? 0;
      const pct    = target > 0 ? Math.round((r.achieved / target) * 100) : null;
      return `${ind?.code ?? '?'}: ${ind?.title ?? 'Unknown'} — Achieved: ${r.achieved} ${ind?.unit ?? ''} / Target: ${target} ${ind?.unit ?? ''} (${pct !== null ? pct + '%' : 'no target'})`;
    }).join(style === 'bullet' ? '\n• ' : '. ');

    // Activities narrative
    const activityTypes   = [...new Set(approvedActivities.map(a => a.activityType).filter(Boolean))];
    const activityDistricts = [...new Set(approvedActivities.map(a => a.district).filter(Boolean))].slice(0, 5);
    const narratives       = approvedActivities
      .filter(a => a.notes || a.challenges)
      .slice(0, 3)
      .map(a => `"${a.title}": ${a.notes ?? a.challenges}`)
      .join(' ');

    // Financial summary
    let financialSummary: string | undefined;
    if (dto.includeFinancials !== false && grants.length > 0) {
      const totalAmount = grants.reduce((s, g) => s + (g.amount ?? 0), 0);
      const totalSpent  = grants.reduce((s, g) => s + (g.amountSpent ?? 0), 0);
      const burnPct     = totalAmount > 0 ? Math.round((totalSpent / totalAmount) * 100) : 0;
      const currency    = grants[0]?.currency ?? 'USD';
      financialSummary = style === 'bullet'
        ? `• Total grant portfolio: ${currency} ${totalAmount.toLocaleString()}\n• Amount disbursed this period: ${currency} ${totalSpent.toLocaleString()} (${burnPct}% of total)\n• ${grants.length} active grant(s)`
        : `During this reporting period, a total of ${currency} ${totalSpent.toLocaleString()} was disbursed against a portfolio of ${currency} ${totalAmount.toLocaleString()} across ${grants.length} active grant(s), representing a ${burnPct}% overall burn rate.`;
    }

    // Stakeholder voice section
    let stakeholderVoice: string | undefined;
    if (dto.includeFeedback !== false && feedback.length > 0) {
      const positiveFeedback = feedback.filter(f => f.sentimentScore && f.sentimentScore >= 60);
      const negativeFeedback = feedback.filter(f => f.sentimentScore && f.sentimentScore < 40);
      const quotes           = feedback.slice(0, 2).map(f => `"${f.content.slice(0, 200)}..." — ${f.isAnonymous ? 'Anonymous' : (f.respondentName ?? 'Community Member')}`);

      stakeholderVoice = [
        `${feedback.length} stakeholder feedback record(s) were collected during this period.`,
        positiveFeedback.length > 0 ? `${positiveFeedback.length} were positive/very positive.` : '',
        negativeFeedback.length > 0 ? `${negativeFeedback.length} required follow-up action.` : '',
        quotes.length > 0 ? '\n\nSelected voices:\n' + quotes.join('\n') : '',
      ].filter(Boolean).join(' ');
    }

    // Challenges & lessons (from activity + period narrative fields)
    const challengeNarratives = approvedActivities
      .filter(a => a.challenges)
      .slice(0, 3)
      .map(a => a.challenges as string)
      .join(' ');
    const periodChallenges = period.challenges ?? '';
    const periodLessons    = period.lessonsLearned ?? '';

    const challengesSection = [
      challengeNarratives,
      periodChallenges,
      periodLessons,
    ].filter(Boolean).join(' ');

    // ── Compose the full report ────────────────────────────────────────────
    const executiveSummary = [
      `This report covers the period ${new Date(period.startDate).toLocaleDateString()} to ${new Date(period.endDate).toLocaleDateString()}.`,
      approvedActivities.length > 0
        ? `A total of ${approvedActivities.length} activities were implemented across ${activityDistricts.length > 0 ? activityDistricts.join(', ') : 'multiple locations'}, reaching ${totalParticipants.toLocaleString()} participants.`
        : 'No approved activities were recorded for this period.',
      results.length > 0
        ? `${onTarget} of ${results.length} indicator(s) met or exceeded 80% of their targets.`
        : 'Indicator results have not yet been calculated for this period.',
      period.narrative ?? '',
    ].filter(Boolean).join(' ');

    const indicatorPerformance = results.length > 0
      ? (style === 'bullet' ? '• ' : '') + indRows
      : 'No indicator results are available for this period. Please calculate results before generating this report.';

    const activitiesNarrative = approvedActivities.length > 0
      ? [
          `During this period, ${approvedActivities.length} activities were conducted`,
          activityTypes.length > 0 ? `spanning ${activityTypes.join(', ')}` : '',
          activityDistricts.length > 0 ? `in ${activityDistricts.join(', ')}` : '',
          `. Total direct beneficiaries reached: ${totalParticipants.toLocaleString()}.`,
          totalQuantity > 0 ? ` Total service units delivered: ${totalQuantity.toLocaleString()}.` : '',
          narratives ? `\n\nField observations: ${narratives}` : '',
        ].filter(Boolean).join(' ')
      : 'No approved activities were recorded during this period.';

    const challengesAndLessons = challengesSection.length > 0
      ? challengesSection
      : 'No specific challenges or lessons were recorded for this period.';

    const nextPeriodPlans = period.nextPeriodPlans ?? approvedActivities
      .filter(a => a.recommendations || a.followUpActions)
      .slice(0, 2)
      .map(a => a.recommendations ?? a.followUpActions)
      .join('. ') || 'Continuation of programmatic activities as per project workplan.';

    return {
      reportingPeriodId: dto.reportingPeriodId,
      generatedAt: new Date().toISOString(),
      style,
      report: {
        title: `${period.name} — Progress Report`,
        executiveSummary,
        indicatorPerformance,
        activitiesNarrative,
        challengesAndLessons,
        financialSummary,
        stakeholderVoice,
        nextPeriodPlans,
        qualityFlags,
      },
      rawData: {
        activityCount:    approvedActivities.length,
        resultCount:      results.length,
        totalParticipants,
        totalQuantity,
        grantCount:       grants.length,
        feedbackCount:    feedback.length,
      },
    };
  }

  // ─── Answer generator ─────────────────────────────────────────────────────

  private answer(prompt: string, metrics: Record<string, number>, indicatorHealth: Array<{ code: string; pct: number }>) {
    const lowerPrompt = prompt.toLowerCase();

    const focus = lowerPrompt.includes('report')
      ? 'reporting readiness'
      : lowerPrompt.includes('grant') || lowerPrompt.includes('fund') || lowerPrompt.includes('budget')
        ? 'financial performance'
        : lowerPrompt.includes('indicator')
          ? 'indicator performance'
          : lowerPrompt.includes('activity')
            ? 'activity follow-up'
            : 'portfolio health';

    const parts = [
      `I reviewed your ${focus} using the current Monival workspace data.`,
      `You have ${metrics.projectCount} project(s), ${metrics.indicatorCount} indicator(s), ${metrics.activityCount} recent activity record(s), and ${metrics.openPeriods} open reporting period(s).`,
    ];

    if (focus === 'financial performance') {
      parts.push(
        `Grant burn rate is ${metrics.burnRate}% versus average indicator progress of ${metrics.avgIndicatorProgress}%.`,
        metrics.burnRate > metrics.avgIndicatorProgress + 20
          ? 'Spend is running ahead of impact — consider reviewing allocation efficiency using the /dashboard/roi endpoint.'
          : 'Financial-programmatic alignment looks reasonable.',
      );
    }

    if (metrics.submittedActivities > 0) {
      parts.push(`${metrics.submittedActivities} activity record(s) are waiting for review — approvals are the fastest way to improve report readiness.`);
    }

    const criticalIndicators = indicatorHealth.filter(i => i.pct < 25 && i.pct > 0);
    if (criticalIndicators.length > 0) {
      parts.push(`⚠ ${criticalIndicators.length} indicator(s) (${criticalIndicators.map(i => i.code).join(', ')}) are below 25% of target and may need adaptive management action.`);
    }

    return parts.join(' ');
  }

  // ─── Recommendations generator ───────────────────────────────────────────

  private recommendations(metrics: Record<string, number>) {
    const recs: string[] = [];

    if (metrics.projectCount === 0) {
      recs.push('Create at least one project before using the copilot for portfolio analysis.');
    }
    if (metrics.indicatorCount === 0) {
      recs.push('Add indicators with baseline and target values so the copilot can reason about progress.');
    }
    if (metrics.submittedActivities > 0) {
      recs.push(`Review ${metrics.submittedActivities} submitted activities before calculating reporting period results.`);
    }
    if (metrics.openPeriods > 0) {
      recs.push('Calculate and submit open reporting periods once activity review is complete.');
    }
    if (metrics.staleProjectCount > 0) {
      recs.push('Check projects past their end date and either close them or update their timeline.');
    }
    if (metrics.burnRate > metrics.avgIndicatorProgress + 25) {
      recs.push(`Grant burn rate (${metrics.burnRate}%) is significantly ahead of indicator progress (${metrics.avgIndicatorProgress}%). Use GET /dashboard/insights for a full financial-programmatic efficiency analysis.`);
    }
    if (recs.length === 0) {
      recs.push('Your current portfolio looks healthy. Ask a focused question about a project, indicator, or reporting period for a deeper analysis.');
    }

    return recs;
  }
}