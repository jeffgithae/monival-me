import { Injectable, NotFoundException } from '@nestjs/common';
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
import { AnthropicService } from '../anthropic.service';
import { DraftReportDto } from './dto/draft-report.dto';

// ─── System prompt ────────────────────────────────────────────────────────────
const EVIDARA_SYSTEM_PROMPT = `\
You are the Evidara M&E Copilot — an expert monitoring, evaluation, and learning assistant \
built into Evidara, a professional M&E platform used by NGOs, development organisations, \
and humanitarian agencies.

Your role is to help M&E officers, programme managers, and field staff:
- Analyse indicator performance and identify data gaps
- Review grant utilisation and flag financial-programmatic misalignment
- Prepare for reporting periods and donor submissions
- Apply adaptive management thinking when programmes are off-track
- Provide concise, evidence-based recommendations grounded in the portfolio data provided

Tone: professional, clear, and actionable. Avoid jargon where simpler language works. \
Never hallucinate data — only reason from the context provided. \
If data is insufficient to answer confidently, say so and suggest what to collect.

Always refer to the platform as "Evidara". Never mention OpenAI, Azure, LangChain, Sibasi, \
Gemini, or any other AI provider or brand.`;

// ─── Report drafter system prompt ─────────────────────────────────────────────
const REPORT_DRAFTER_SYSTEM_PROMPT = `\
You are the Evidara Donor Report Drafter. You write clear, professional first-draft donor \
and progress reports for NGOs and development organisations. Your drafts are based solely \
on verified M&E data from the Evidara platform — never fabricate figures or outcomes.

Report writing principles:
- Lead with results and impact, not activities
- Use plain language appropriate for donor audiences (bilateral, multilateral, private)
- Flag data quality issues transparently in a quality notes section
- Keep executive summaries to 3–5 sentences
- Use concrete numbers wherever available
- For bullet style: use concise parallel bullet points
- For executive style: lead with key result, then supporting evidence in 2–3 paragraphs
- For narrative style: flowing paragraphs with indicator results woven in

Never invent participant counts, percentages, or outcome statements. \
If data is missing, write placeholder text clearly marked [DATA NEEDED].`;

@Injectable()
export class CopilotService {
  constructor(
    @InjectModel(Project.name)             private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name)           private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name)            private readonly activityModel: Model<Activity>,
    @InjectModel(ReportingPeriod.name)     private readonly reportingPeriodModel: Model<ReportingPeriod>,
    @InjectModel(IndicatorResult.name)     private readonly resultModel: Model<IndicatorResult>,
    @InjectModel(Beneficiary.name)         private readonly beneficiaryModel: Model<Beneficiary>,
    @InjectModel(Grant.name)               private readonly grantModel: Model<Grant>,
    @InjectModel(StakeholderFeedback.name) private readonly feedbackModel: Model<StakeholderFeedback>,
    private readonly anthropic: AnthropicService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // COPILOT CHAT
  // ─────────────────────────────────────────────────────────────────────────────

  async message(organizationId: string, dto: CopilotMessageDto) {
    const orgId = new Types.ObjectId(organizationId);
    const projectFilter: Record<string, unknown> = { organizationId: orgId };
    if (dto.projectId) projectFilter.projectId = new Types.ObjectId(dto.projectId);

    // ── Gather portfolio context ───────────────────────────────────────────
    const [projects, indicators, activities, periods, benStats, grantSummary] = await Promise.all([
      this.projectModel
        .find(dto.projectId ? { organizationId: orgId, _id: new Types.ObjectId(dto.projectId) } : { organizationId: orgId })
        .sort({ createdAt: -1 }).limit(10).lean(),

      this.indicatorModel.find(projectFilter).sort({ code: 1 }).limit(30).lean(),

      this.activityModel
        .find({ ...projectFilter, activityDate: { $gte: new Date(Date.now() - 90 * 86400000) } })
        .sort({ activityDate: -1 }).limit(20).lean(),

      this.reportingPeriodModel.find(projectFilter).sort({ endDate: -1 }).limit(6).lean(),

      this.beneficiaryModel.aggregate([
        { $match: { organizationId: orgId } },
        { $group: {
          _id: null,
          total:      { $sum: 1 },
          active:     { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
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
          currency: { $first: '$currency' },
        }},
      ]),
    ]);

    const grants  = grantSummary[0] ?? { totalAmount: 0, totalSpent: 0, count: 0, currency: 'USD' };
    const burnRate = grants.totalAmount > 0
      ? Math.round((grants.totalSpent / grants.totalAmount) * 100) : 0;

    const indicatorSummary = indicators.map(ind => {
      const achieved = ind.achieved ?? (ind as any).lastAchievedValue ?? 0;
      const target   = ind.target ?? 0;
      const pct      = target > 0 ? Math.round((achieved / target) * 100) : null;
      return {
        code: ind.code,
        title: ind.title,
        unit: ind.unit ?? 'units',
        achieved,
        target,
        progressPct: pct,
        hasTarget: target > 0,
      };
    });

    const openPeriods      = periods.filter(p => p.status === 'open');
    const submittedActs    = activities.filter(a => a.status === 'submitted').length;
    const approvedActs     = activities.filter(a => a.status === 'approved').length;
    const overdueProjects  = projects.filter(p =>
      p.endDate && new Date(p.endDate).getTime() < Date.now() && p.status !== 'completed',
    );

    // ── Build the context block Claude will reason over ─────────────────
    const contextBlock = `
## Evidara Portfolio Context
Organisation: ${organizationId}
${dto.projectId ? `Project filter: ${projects[0]?.name ?? dto.projectId}` : 'Scope: full workspace'}

### Projects (${projects.length})
${projects.map(p => `- ${p.name} [${p.status}] ${p.endDate ? `ends ${new Date(p.endDate).toLocaleDateString()}` : ''} ${p.donor ? `| Donor: ${p.donor}` : ''}`).join('\n') || 'None'}
Overdue projects (past end date, not completed): ${overdueProjects.length}

### Indicators (${indicators.length})
${indicatorSummary.map(i =>
  `- ${i.code}: ${i.title} | Achieved: ${i.achieved} / Target: ${i.hasTarget ? i.target : 'not set'} ${i.unit}${i.progressPct !== null ? ` (${i.progressPct}%)` : ''}`
).join('\n') || 'None'}

### Activities (last 90 days, ${activities.length} records)
- Submitted (awaiting approval): ${submittedActs}
- Approved: ${approvedActs}
- Draft: ${activities.filter(a => a.status === 'draft').length}
Recent: ${activities.slice(0, 5).map(a => `${a.title} [${a.status}] ${new Date(a.activityDate).toLocaleDateString()}`).join(', ')}

### Reporting Periods (${periods.length})
${periods.map(p => `- ${p.name} [${p.status}] ${new Date(p.startDate).toLocaleDateString()} – ${new Date(p.endDate).toLocaleDateString()}`).join('\n') || 'None'}
Open periods: ${openPeriods.length}
Overdue open periods: ${openPeriods.filter(p => new Date(p.endDate) < new Date()).length}

### Grants
Active/pending grants: ${grants.count}
Portfolio: ${grants.currency} ${grants.totalAmount.toLocaleString()} | Spent: ${grants.currency} ${grants.totalSpent.toLocaleString()} (${burnRate}% burn rate)

### Beneficiaries
Total registered: ${benStats[0]?.total ?? 0} | Active: ${benStats[0]?.active ?? 0} | Vulnerable: ${benStats[0]?.vulnerable ?? 0}
`.trim();

    // ── Build message history for multi-turn support ─────────────────────
    const history = dto.history ?? [];
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      {
        role: 'user' as const,
        content: `${contextBlock}\n\n---\n\nUser question: ${dto.message}`,
      },
    ];

    const reply = await this.anthropic.chat(EVIDARA_SYSTEM_PROMPT, messages, 1500);

    return {
      answer: reply,
      context: {
        projects: projects.map(p => ({
          id: p._id.toString(), name: p.name, status: p.status,
          donor: p.donor, endDate: p.endDate,
        })),
        beneficiaries: {
          total:      benStats[0]?.total      ?? 0,
          active:     benStats[0]?.active     ?? 0,
          vulnerable: benStats[0]?.vulnerable ?? 0,
        },
        grants: {
          count: grants.count, totalAmount: grants.totalAmount,
          totalSpent: grants.totalSpent, burnRatePct: burnRate, currency: grants.currency,
        },
        indicators: indicatorSummary,
        recentActivities: activities.slice(0, 5).map(a => ({
          id: a._id.toString(), title: a.title, status: a.status, activityDate: a.activityDate,
        })),
        reportingPeriods: periods.map(p => ({
          id: p._id.toString(), name: p.name, status: p.status,
          startDate: p.startDate, endDate: p.endDate,
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DONOR REPORT DRAFTER
  // ─────────────────────────────────────────────────────────────────────────────

  async draftReport(organizationId: string, dto: DraftReportDto) {
    const orgId    = new Types.ObjectId(organizationId);
    const periodId = new Types.ObjectId(dto.reportingPeriodId);
    const style    = dto.style ?? 'narrative';

    // ── Step 1: fetch period ─────────────────────────────────────────────
    const period = await this.reportingPeriodModel
      .findOne({ _id: periodId, organizationId: orgId }).lean();
    if (!period) throw new NotFoundException('Reporting period not found.');

    // ── Step 2: parallel data fetch ──────────────────────────────────────
    const [results, approvedActivities, grants, feedback] = await Promise.all([
      this.resultModel
        .find({ reportingPeriodId: periodId, organizationId: orgId })
        .populate('indicatorId').lean(),

      this.activityModel.find({
        organizationId: orgId,
        status: 'approved',
        activityDate: {
          $gte: new Date(period.startDate),
          $lte: new Date(period.endDate),
        },
        ...(period.projectId ? { projectId: period.projectId } : {}),
      }).lean(),

      dto.includeFinancials !== false
        ? (this.grantModel.find({
            organizationId: orgId,
            status: { $in: ['active', 'pending'] },
          }).lean() as Promise<Grant[]>)
        : Promise.resolve([] as Grant[]),

      dto.includeFeedback !== false
        ? (this.feedbackModel.find({
            organizationId: orgId,
            ...(period.projectId ? { projectId: period.projectId } : {}),
            createdAt: {
              $gte: new Date(period.startDate),
              $lte: new Date(period.endDate),
            },
          }).sort({ sentimentScore: -1 }).limit(5).lean() as Promise<StakeholderFeedback[]>)
        : Promise.resolve([] as StakeholderFeedback[]),
    ]);

    // ── Step 3: quality flags ────────────────────────────────────────────
    const qualityFlags: string[] = [];
    if (results.length === 0)
      qualityFlags.push('No indicator results calculated — run Calculate Results first.');
    if (approvedActivities.length === 0)
      qualityFlags.push('No approved activities found in this date range.');
    const atRisk = results.filter(r => {
      const ind = (r as any).indicatorId as any;
      return ind?.target > 0 && r.achieved < ind.target * 0.5;
    }).length;
    if (atRisk > 0)
      qualityFlags.push(`${atRisk} indicator(s) below 50% of target — address in challenges section.`);
    if (period.status !== 'submitted' && period.status !== 'approved')
      qualityFlags.push('Period not yet submitted — draft is based on current (unfinished) data.');

    // ── Step 4: build data summary for Claude ────────────────────────────
    const totalParticipants = approvedActivities.reduce((s, a) => s + ((a as any).participants ?? 0), 0);
    const totalQuantity     = approvedActivities.reduce((s, a) => s + ((a as any).quantity ?? 0), 0);
    const onTarget          = results.filter(r => {
      const ind = (r as any).indicatorId as any;
      return ind?.target > 0 && r.achieved >= ind.target * 0.8;
    }).length;

    const indicatorRows = results.map(r => {
      const ind    = (r as any).indicatorId as any;
      const target = ind?.target ?? 0;
      const pct    = target > 0 ? Math.round((r.achieved / target) * 100) : null;
      return `${ind?.code ?? '?'} — ${ind?.title ?? 'Unknown'}: achieved ${r.achieved} ${ind?.unit ?? ''} of ${target} ${ind?.unit ?? ''} target${pct !== null ? ` (${pct}%)` : ''}`;
    }).join('\n');

    const activityDistricts = [...new Set(approvedActivities.map(a => (a as any).district).filter(Boolean))].slice(0, 6);
    const activityTypes     = [...new Set(approvedActivities.map(a => (a as any).activityType).filter(Boolean))];
    const fieldNotes        = approvedActivities
      .filter(a => (a as any).notes || (a as any).challenges)
      .slice(0, 4)
      .map(a => `"${(a as any).title}": ${(a as any).notes ?? (a as any).challenges}`)
      .join('\n');

    let financialContext = '';
    if (grants.length > 0) {
      const totalAmount = grants.reduce((s, g) => s + ((g as any).amount ?? 0), 0);
      const totalSpent  = grants.reduce((s, g) => s + ((g as any).amountSpent ?? 0), 0);
      const burnPct     = totalAmount > 0 ? Math.round((totalSpent / totalAmount) * 100) : 0;
      const currency    = (grants[0] as any)?.currency ?? 'USD';
      financialContext  = `\nFinancial summary:\n- Portfolio: ${currency} ${totalAmount.toLocaleString()}\n- Disbursed: ${currency} ${totalSpent.toLocaleString()} (${burnPct}% burn rate)\n- Active grants: ${grants.length}`;
    }

    let feedbackContext = '';
    if (feedback.length > 0) {
      const positive = feedback.filter(f => (f as any).sentimentScore >= 60).length;
      const quotes   = feedback.slice(0, 2)
        .map(f => `"${(f as any).content?.slice(0, 180)}" — ${(f as any).isAnonymous ? 'Anonymous' : ((f as any).respondentName ?? 'Community member')}`)
        .join('\n');
      feedbackContext = `\nStakeholder feedback (${feedback.length} records, ${positive} positive):\n${quotes}`;
    }

    const periodChallenges   = (period as any).challenges ?? '';
    const periodLessons      = (period as any).lessonsLearned ?? '';
    const periodNarrative    = (period as any).narrative ?? '';
    const nextPeriodPlans    = (period as any).nextPeriodPlans ?? '';

    const dataBlock = `
REPORTING PERIOD: ${period.name}
Dates: ${new Date(period.startDate).toLocaleDateString()} – ${new Date(period.endDate).toLocaleDateString()}
Status: ${period.status}
Style requested: ${style}

INDICATOR RESULTS (${results.length} results, ${onTarget}/${results.length} on or near target):
${indicatorRows || '[No results calculated yet]'}

APPROVED ACTIVITIES (${approvedActivities.length}):
- Locations: ${activityDistricts.join(', ') || 'Not specified'}
- Types: ${activityTypes.join(', ') || 'Not specified'}
- Total participants/beneficiaries reached: ${totalParticipants.toLocaleString()}
- Total quantity/units delivered: ${totalQuantity.toLocaleString()}
Field notes from activities:
${fieldNotes || '[None recorded]'}
${financialContext}
${feedbackContext}

PERIOD NARRATIVE (staff notes): ${periodNarrative || '[None]'}
CHALLENGES RECORDED: ${periodChallenges || '[None]'}
LESSONS LEARNED: ${periodLessons || '[None]'}
NEXT PERIOD PLANS: ${nextPeriodPlans || '[None]'}
`.trim();

    const prompt = `
Using ONLY the verified M&E data below, write a complete ${style} donor/progress report for this reporting period.

Structure your output as JSON with these exact keys:
- title: string
- executiveSummary: string (3-5 sentences)
- indicatorPerformance: string (results narrative)
- activitiesNarrative: string (what was done, where, who was reached)
- challengesAndLessons: string
- financialSummary: string or null (if no financial data)
- stakeholderVoice: string or null (if no feedback)
- nextPeriodPlans: string

Use [DATA NEEDED] for any section where data is genuinely missing. Output ONLY valid JSON, no markdown fences.

${dataBlock}
`.trim();

    const raw = await this.anthropic.complete(REPORT_DRAFTER_SYSTEM_PROMPT, prompt, 3000);

    let report: Record<string, string | null>;
    try {
      report = JSON.parse(raw);
    } catch {
      // Fallback: return raw text as executiveSummary if JSON parse fails
      report = {
        title: `${period.name} — Progress Report`,
        executiveSummary: raw,
        indicatorPerformance: '[See above]',
        activitiesNarrative: '[See above]',
        challengesAndLessons: periodChallenges || '[None recorded]',
        financialSummary: null,
        stakeholderVoice: null,
        nextPeriodPlans: nextPeriodPlans || '[Continuation of activities as per workplan]',
      };
    }

    return {
      reportingPeriodId: dto.reportingPeriodId,
      generatedAt: new Date().toISOString(),
      style,
      report: {
        ...report,
        qualityFlags,
      },
      rawData: {
        activityCount: approvedActivities.length,
        resultCount:   results.length,
        totalParticipants,
        totalQuantity,
        grantCount:    grants.length,
        feedbackCount: feedback.length,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GENERATE THEORY OF CHANGE (project-level)
  // ─────────────────────────────────────────────────────────────────────────────

  async generateToC(organizationId: string, projectId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const project = await this.projectModel
      .findOne({ _id: new Types.ObjectId(projectId), organizationId: orgId }).lean();
    if (!project) throw new NotFoundException('Project not found.');

    const indicators = await this.indicatorModel
      .find({ organizationId: orgId, projectId: new Types.ObjectId(projectId) })
      .sort({ code: 1 }).limit(20).lean();

    const prompt = `
Generate a Theory of Change for the following development project.

Project: ${(project as any).name}
Description: ${(project as any).description ?? '[Not provided]'}
Sector: ${(project as any).sector ?? '[Not specified]'}
Objectives: ${((project as any).objectives ?? []).join('; ') || '[Not specified]'}
Donor: ${(project as any).donor ?? '[Not specified]'}

Indicators (${indicators.length}):
${indicators.map(i => `- ${i.code}: ${i.title} (target: ${i.target ?? 'TBC'} ${i.unit ?? ''})`).join('\n') || '[None configured]'}

Write a structured Theory of Change with these sections:
1. Problem Statement (2–3 sentences)
2. Inputs (what resources are applied)
3. Activities (key intervention types)
4. Outputs (immediate measurable deliverables, linked to indicators where possible)
5. Outcomes (medium-term changes)
6. Impact (long-term change goal)
7. Key Assumptions
8. Risk Factors

Keep it concise and grounded in the project data above. Use [TO COMPLETE] for sections where data is insufficient.
`.trim();

    const text = await this.anthropic.complete(EVIDARA_SYSTEM_PROMPT, prompt, 2000);
    return { projectId, generatedAt: new Date().toISOString(), theoryOfChange: text };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GENERATE INDICATOR DEFINITION
  // ─────────────────────────────────────────────────────────────────────────────

  async generateIndicatorDefinition(
    organizationId: string,
    data: { title: string; level: string; sector?: string; unit?: string },
  ) {
    const prompt = `
Write a complete SMART indicator definition for an M&E framework.

Indicator title: ${data.title}
Level: ${data.level} (output / outcome / impact)
Sector: ${data.sector ?? 'General development'}
Unit of measurement: ${data.unit ?? 'To be determined'}

Provide:
1. Refined indicator title (SMART)
2. Definition (2–3 sentences explaining exactly what is measured)
3. Unit of measurement
4. Numerator and denominator (if applicable)
5. Data source suggestions
6. Collection frequency recommendation
7. Disaggregation variables (sex, age, location, etc.)
8. Baseline collection method
9. Common pitfalls for this indicator type

Output as JSON with keys: refinedTitle, definition, unit, numerator, denominator, dataSources, frequency, disaggregation, baselineMethod, pitfalls.
Output ONLY valid JSON, no markdown fences.
`.trim();

    const raw = await this.anthropic.complete(EVIDARA_SYSTEM_PROMPT, prompt, 1500);
    try {
      return { generatedAt: new Date().toISOString(), definition: JSON.parse(raw) };
    } catch {
      return { generatedAt: new Date().toISOString(), definition: { refinedTitle: data.title, raw } };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUGGEST FOLLOW-UP ACTIONS (adaptive management)
  // ─────────────────────────────────────────────────────────────────────────────

  async suggestActions(organizationId: string, projectId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const filter: Record<string, unknown> = { organizationId: orgId };
    if (projectId) filter.projectId = new Types.ObjectId(projectId);

    const [indicators, activities, periods, grants] = await Promise.all([
      this.indicatorModel.find(filter).lean(),
      this.activityModel
        .find({ ...filter, activityDate: { $gte: new Date(Date.now() - 60 * 86400000) } })
        .sort({ activityDate: -1 }).limit(15).lean(),
      this.reportingPeriodModel.find(filter).sort({ endDate: -1 }).limit(4).lean(),
      this.grantModel.find({ organizationId: orgId, status: 'active' }).lean(),
    ]);

    const indSummary = indicators.map(i => {
      const achieved = i.achieved ?? (i as any).lastAchievedValue ?? 0;
      const pct = i.target > 0 ? Math.round((achieved / i.target) * 100) : null;
      return `${i.code}: ${i.title} — ${pct !== null ? pct + '%' : 'no target'} of target`;
    }).join('\n');

    const grantSummary = grants.map(g => {
      const burn = (g as any).amount > 0 ? Math.round(((g as any).amountSpent / (g as any).amount) * 100) : 0;
      return `${(g as any).name}: ${burn}% burned, expires ${(g as any).endDate ? new Date((g as any).endDate).toLocaleDateString() : 'N/A'}`;
    }).join('\n');

    const prompt = `
Based on the following Evidara portfolio data, provide 5–8 prioritised adaptive management recommendations. 
For each recommendation, provide:
- priority: "critical" | "high" | "medium" | "low"
- area: short category (e.g. "Data Collection", "Approvals", "Reporting", "Financial")
- action: 1–2 sentence specific action
- rationale: brief reason

Output as JSON array. Output ONLY valid JSON, no markdown fences.

INDICATORS (${indicators.length}):
${indSummary || '[None]'}

ACTIVITIES (last 60 days): ${activities.length} records, ${activities.filter(a => a.status === 'submitted').length} awaiting approval

REPORTING PERIODS:
${periods.map(p => `${p.name} [${p.status}] ends ${new Date(p.endDate).toLocaleDateString()}`).join('\n') || '[None]'}

GRANTS:
${grantSummary || '[None active]'}
`.trim();

    const raw = await this.anthropic.complete(EVIDARA_SYSTEM_PROMPT, prompt, 1200);
    let actions: unknown[];
    try {
      actions = JSON.parse(raw);
    } catch {
      actions = [{ priority: 'medium', area: 'General', action: raw, rationale: '' }];
    }
    return { generatedAt: new Date().toISOString(), actions };
  }
}