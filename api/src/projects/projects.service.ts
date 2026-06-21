import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementsService } from '../organizations/entitlements.service';
import { OrgRole } from '../common/constants/roles';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { ReportingPeriod } from '../reporting/schemas/reporting-period.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  Project,
  ProjectMilestone,
  ProjectRisk,
  WorkplanItem,
  ProjectStakeholder,
} from './schemas/project.schema';
import { escapeRegex } from '../common/utils/escape-regex';

export interface ProjectListQuery {
  status?: string;
  sector?: string;
  donorId?: string;
  tag?: string;
  search?: string;
  isArchived?: boolean;
  isTemplate?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(ReportingPeriod.name) private readonly periodModel: Model<ReportingPeriod>,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAll(organizationId: string, query: ProjectListQuery = {}) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    // Default: exclude archived unless explicitly requested
    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    } else {
      filter.isArchived = { $ne: true };
    }

    if (query.status)   filter.status   = query.status;
    if (query.sector)   filter.sector   = query.sector;
    if (query.donorId)  filter.donorId  = new Types.ObjectId(query.donorId);
    if (query.tag)      filter.tags     = query.tag;
    if (query.isTemplate !== undefined) filter.isTemplate = query.isTemplate;

    if (query.search) {
      const re = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [
        { name: re },
        { projectCode: re },
        { description: re },
        { donor: re },
        { tags: re },
      ];
    }

    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, query.limit ?? 50);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.projectModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.projectModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    const project = await this.projectModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── Rich summary ──────────────────────────────────────────────────────────

  async summary(organizationId: string, id: string) {
    const orgId   = new Types.ObjectId(organizationId);
    const project = await this.findOne(organizationId, id);

    const [indicators, activities, periods] = await Promise.all([
      this.indicatorModel.find({ organizationId: orgId, projectId: new Types.ObjectId(id) }).lean(),
      this.activityModel.find({ organizationId: orgId, projectId: new Types.ObjectId(id) }).sort({ activityDate: -1 }).lean(),
      this.periodModel.find({ organizationId: orgId, projectId: new Types.ObjectId(id) }).sort({ startDate: -1 }).lean(),
    ]);

    const approved  = activities.filter(a => a.status === 'approved');
    const submitted = activities.filter(a => a.status === 'submitted');
    const rejected  = activities.filter(a => a.status === 'rejected');

    // Per-indicator progress
    const indicatorProgress = indicators.map(ind => {
      const linked   = approved.filter(a => a.indicatorId?.toString() === ind._id.toString());
      const achieved = linked.reduce((s, a) => s + (a.quantity ?? 0), 0);
      const pct      = ind.target > 0 ? Math.min(100, Math.round((achieved / ind.target) * 100)) : 0;
      // Trend: compare last two periods of data
      const sortedQuantities = linked
        .sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
        .map(a => a.quantity ?? 0);
      const trend = sortedQuantities.length < 2 ? 'n/a'
        : sortedQuantities[0] > sortedQuantities[1] ? 'up'
        : sortedQuantities[0] < sortedQuantities[1] ? 'down'
        : 'stable';

      return {
        _id:               ind._id,
        code:              ind.code,
        title:             ind.title,
        unit:              ind.unit,
        level:             ind.level,
        baseline:          ind.baseline,
        target:            ind.target,
        achieved,
        remaining:         Math.max(0, ind.target - achieved),
        pct,
        trend,
        status:            pct >= 75 ? 'on_track' : pct >= 40 ? 'at_risk' : 'behind',
        direction:         ind.direction,
        cumulative:        ind.cumulative,
        frequency:         ind.frequency,
        dataSource:        ind.dataSource,
        responsiblePerson: ind.responsiblePerson,
        isCore:            ind.isCore,
        sdgGoals:          ind.sdgGoals,
        activityCount:     linked.length,
      };
    });

    const avgProgress = indicatorProgress.length
      ? Math.round(indicatorProgress.reduce((s, i) => s + i.pct, 0) / indicatorProgress.length)
      : 0;

    // Timeline
    let timelinePct: number | null = null;
    let daysRemaining: number | null = null;
    if (project.startDate && project.endDate) {
      const start = new Date(project.startDate).getTime();
      const end   = new Date(project.endDate).getTime();
      timelinePct   = Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)));
      daysRemaining = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
    }

    // Freshness
    const lastActivity  = activities[0] ?? null;
    const freshnessDays = lastActivity
      ? Math.ceil((Date.now() - new Date(lastActivity.activityDate).getTime()) / 86400000)
      : null;

    // Financials
    const totalParticipants     = approved.reduce((s, a) => s + (a.participants ?? 0), 0);
    const totalCost             = approved.reduce((s, a) => s + (a.cost ?? 0), 0);
    const budgetUtilisationPct  = project.totalBudget > 0
      ? Math.min(100, Math.round((totalCost / project.totalBudget) * 100))
      : null;

    // Risks
    const openRisks  = project.risks?.filter(r => r.status === 'open').length ?? 0;
    const highRisks  = project.risks?.filter(r => r.status === 'open' && ['high', 'critical'].includes(r.impact)).length ?? 0;
    const riskScore  = project.risks?.filter(r => r.status === 'open').reduce((s, r) => {
      const lMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      const iMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      return s + (lMap[r.likelihood] ?? 2) * (iMap[r.impact] ?? 2);
    }, 0) ?? 0;

    // Milestones
    const overdueMilestones = project.milestones?.filter(
      m => !['completed', 'cancelled'].includes(m.status) && new Date(m.dueDate) < new Date(),
    ).length ?? 0;
    const completedMilestones = project.milestones?.filter(m => m.status === 'completed').length ?? 0;
    const milestoneProgress   = project.milestones?.length
      ? Math.round((completedMilestones / project.milestones.length) * 100)
      : null;

    // Data quality score
    const missingEvidence  = approved.filter(a => !a.evidenceUrl && !a.evidenceNotes).length;
    const noTargetCount    = indicators.filter(i => !i.target).length;
    const staleCount       = indicators.filter(ind => {
      const linked = approved.filter(a => a.indicatorId?.toString() === ind._id.toString());
      if (!linked.length) return true;
      const latest = Math.max(...linked.map(a => new Date(a.activityDate).getTime()));
      return (Date.now() - latest) / 86400000 > 60;
    }).length;
    const qualityDeductions = (missingEvidence / Math.max(1, approved.length)) * 20
      + (noTargetCount / Math.max(1, indicators.length)) * 30
      + (staleCount / Math.max(1, indicators.length)) * 30;
    const dataQualityScore = Math.round(Math.max(0, 100 - qualityDeductions));

    return {
      project,
      indicators: indicatorProgress,
      activityCounts: {
        total:    activities.length,
        approved: approved.length,
        submitted: submitted.length,
        rejected: rejected.length,
        draft:    activities.filter(a => a.status === 'draft').length,
      },
      periods: periods.map(p => ({
        _id: p._id, name: p.name, cadence: p.cadence,
        status: p.status, startDate: p.startDate, endDate: p.endDate,
      })),
      summary: {
        avgProgress,
        totalParticipants,
        totalCost,
        budgetUtilisationPct,
        indicatorCount:       indicators.length,
        coreIndicatorCount:   indicators.filter(i => i.isCore).length,
        onTrack:  indicatorProgress.filter(i => i.status === 'on_track').length,
        atRisk:   indicatorProgress.filter(i => i.status === 'at_risk').length,
        behind:   indicatorProgress.filter(i => i.status === 'behind').length,
        timelinePct,
        daysRemaining,
        freshnessDays,
        openRisks,
        highRisks,
        riskScore,
        overdueMilestones,
        completedMilestones,
        milestoneProgress,
        lockedPeriods:        periods.filter(p => p.status === 'locked').length,
        reportingPeriodCount: periods.length,
        dataQualityScore,
      },
    };
  }

  // ─── Portfolio statistics (org-level) ─────────────────────────────────────

  async portfolioStats(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const [projects, activities, indicators] = await Promise.all([
      this.projectModel.find({ organizationId: orgId, isArchived: { $ne: true } }).lean(),
      this.activityModel.find({ organizationId: orgId }).lean(),
      this.indicatorModel.find({ organizationId: orgId }).lean(),
    ]);

    const statusBreakdown = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sectorBreakdown = projects.reduce((acc, p) => {
      const s = p.sector ?? 'other';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalBudget        = projects.reduce((s, p) => s + (p.totalBudget ?? 0), 0);
    const totalParticipants  = activities.filter(a => a.status === 'approved').reduce((s, a) => s + (a.participants ?? 0), 0);
    const totalCost          = activities.filter(a => a.status === 'approved').reduce((s, a) => s + (a.cost ?? 0), 0);
    const pendingApprovals   = activities.filter(a => a.status === 'submitted').length;
    const overdueMilestones  = projects.flatMap(p => p.milestones ?? []).filter(
      m => !['completed', 'cancelled'].includes(m.status) && new Date(m.dueDate) < new Date(),
    ).length;
    const openRisks = projects.flatMap(p => p.risks ?? []).filter(r => r.status === 'open').length;

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        projects:    projects.length,
        indicators:  indicators.length,
        activities:  activities.length,
        pendingApprovals,
        overdueMilestones,
        openRisks,
      },
      financials: {
        totalBudget,
        totalCost,
        budgetUtilisationPct: totalBudget > 0
          ? Math.round((totalCost / totalBudget) * 100) : null,
        totalParticipants,
      },
      breakdowns: { status: statusBreakdown, sector: sectorBreakdown },
    };
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(organizationId: string, dto: CreateProjectDto, actorUserId?: string) {
    await this.entitlements.assertCanAddProject(organizationId);

    const project = await this.projectModel.create({
      organizationId:              new Types.ObjectId(organizationId),
      name:                        dto.name,
      projectCode:                 dto.projectCode,
      description:                 dto.description,
      objectives:                  dto.objectives ?? [],
      tags:                        dto.tags ?? [],
      sector:                      dto.sector,
      subSectors:                  dto.subSectors ?? [],
      status:                      dto.status ?? 'active',
      projectPhase:                dto.projectPhase,
      evaluationStatus:            dto.evaluationStatus ?? 'not_started',
      evaluationSummary:           dto.evaluationSummary,
      lessonsLearned:              dto.lessonsLearned,
      archiveNotes:                dto.archiveNotes,
      theoreticalApproach:         dto.theoreticalApproach,
      problemStatement:            dto.problemStatement,
      changeHypothesis:            dto.changeHypothesis,
      keyAssumptions:              dto.keyAssumptions ?? [],
      donor:                       dto.donor,
      donorId:                     dto.donorId   ? new Types.ObjectId(dto.donorId)   : undefined,
      grantReference:              dto.grantReference,
      totalBudget:                 dto.totalBudget ?? 0,
      currency:                    dto.currency ?? 'USD',
      startDate:                   dto.startDate    ? new Date(dto.startDate)    : undefined,
      endDate:                     dto.endDate      ? new Date(dto.endDate)      : undefined,
      closureDate:                 dto.closureDate  ? new Date(dto.closureDate)  : undefined,
      nextReviewDate:              dto.nextReviewDate ? new Date(dto.nextReviewDate) : undefined,
      extensionMonths:             dto.extensionMonths ?? 0,
      country:                     dto.country,
      region:                      dto.region,
      district:                    dto.district,
      geoPoint:                    this.geoPoint(dto.latitude, dto.longitude),
      implementationAreas:         dto.implementationAreas ?? [],
      coverageArea:                dto.coverageArea,
      targetBeneficiaryCount:      dto.targetBeneficiaryCount ?? 0,
      targetDirectBeneficiaries:   dto.targetDirectBeneficiaries ?? 0,
      targetIndirectBeneficiaries: dto.targetIndirectBeneficiaries ?? 0,
      targetGroups:                dto.targetGroups ?? [],
      populationServed:            dto.populationServed,
      implementationPartners:      dto.implementationPartners ?? [],
      partnerIds:                  dto.partnerIds?.map(id => new Types.ObjectId(id)) ?? [],
      projectManagerId:            dto.projectManagerId ? new Types.ObjectId(dto.projectManagerId) : undefined,
      projectManagerName:          dto.projectManagerName,
      meOfficerId:                 dto.meOfficerId ? new Types.ObjectId(dto.meOfficerId) : undefined,
      meOfficerName:               dto.meOfficerName,
      sdgGoals:                    dto.sdgGoals ?? [],
      frameworks:                  dto.frameworks ?? [],
      reportingFrequency:          dto.reportingFrequency ?? 'quarterly',
      reportingNotes:              dto.reportingNotes,
      requiresEvidencePerActivity: dto.requiresEvidencePerActivity ?? false,
      requiresDisaggregation:      dto.requiresDisaggregation ?? false,
      isTemplate:                  dto.isTemplate ?? false,
      isArchived:                  false,
    });

    await Promise.all([
      this.notifications.notifyRoles(
        organizationId,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
        {
          type: 'project.created',
          title: `Project created: ${project.name}`,
          message: `A new project "${project.name}" has been created and is ready for planning.`,
          entityType: 'project',
          entityId: project._id.toString(),
          link: `/projects/${project._id}`,
        },
      ),
      this.audit.record({
        organizationId, actorUserId,
        action: 'project.created', entityType: 'Project',
        entityId: project._id.toString(),
        metadata: { name: project.name, sector: project.sector, status: project.status },
      }),
    ]);

    return project;
  }

  async update(organizationId: string, id: string, dto: UpdateProjectDto, actorUserId?: string) {
    const update: Record<string, unknown> = { ...dto };

    // Date conversions
    for (const f of ['startDate', 'endDate', 'closureDate', 'nextReviewDate'] as const) {
      if (dto[f]) update[f] = new Date(dto[f] as string);
    }
    // ObjectId conversions
    if (dto.donorId)          update.donorId          = new Types.ObjectId(dto.donorId);
    if (dto.projectManagerId) update.projectManagerId = new Types.ObjectId(dto.projectManagerId);
    if (dto.meOfficerId)      update.meOfficerId      = new Types.ObjectId(dto.meOfficerId);
    if (dto.partnerIds)       update.partnerIds       = dto.partnerIds.map(p => new Types.ObjectId(p));

    const gp = this.geoPoint(dto.latitude, dto.longitude);
    if (gp) update.geoPoint = gp;

    // Strip primitives passed through DTO that aren't schema fields
    delete update.latitude;
    delete update.longitude;
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        update,
        { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');

    await this.audit.record({
      organizationId, actorUserId,
      action: 'project.updated', entityType: 'Project', entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return project;
  }

  async remove(organizationId: string, id: string, actorUserId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const projectId = new Types.ObjectId(id);

    const project = await this.projectModel
      .findOne({ _id: id, organizationId: orgId }).lean();
    if (!project) throw new NotFoundException('Project not found');

    // Count dependent records so caller can warn/confirm before deletion
    const [indicatorCount, activityCount, periodCount] = await Promise.all([
      this.indicatorModel.countDocuments({ projectId, organizationId: orgId }),
      this.activityModel.countDocuments({ projectId, organizationId: orgId }),
      this.periodModel.countDocuments({ projectId, organizationId: orgId }),
    ]);

    // Cascade delete all related records
    await Promise.all([
      this.indicatorModel.deleteMany({ projectId, organizationId: orgId }),
      this.activityModel.deleteMany({ projectId, organizationId: orgId }),
      this.periodModel.deleteMany({ projectId, organizationId: orgId }),
      this.projectModel.deleteOne({ _id: id, organizationId: orgId }),
    ]);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'project.deleted', entityType: 'Project', entityId: id,
      metadata: { name: project.name, cascadeDeleted: { indicatorCount, activityCount, periodCount } },
    });

    return { deleted: true, cascadeDeleted: { indicatorCount, activityCount, periodCount } };
  }

  // ─── Archive / close ───────────────────────────────────────────────────────

  async archive(organizationId: string, id: string, notes: string, actorUserId?: string) {
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        { isArchived: true, status: 'archived', archiveNotes: notes },
        { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({
      organizationId, actorUserId,
      action: 'project.archived', entityType: 'Project', entityId: id,
      metadata: { notes },
    });
    return project;
  }

  async close(organizationId: string, id: string, dto: { closureDate: string; lessonsLearned?: string; evaluationSummary?: string }, actorUserId?: string) {
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          status: 'completed',
          closureDate: new Date(dto.closureDate),
          lessonsLearned: dto.lessonsLearned,
          evaluationSummary: dto.evaluationSummary,
          evaluationStatus: dto.evaluationSummary ? 'completed' : 'in_progress',
        },
        { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({
      organizationId, actorUserId,
      action: 'project.closed', entityType: 'Project', entityId: id,
      metadata: { closureDate: dto.closureDate },
    });
    return project;
  }

  // ─── Duplicate ─────────────────────────────────────────────────────────────

  async duplicate(organizationId: string, id: string, newName: string, actorUserId?: string) {
    await this.entitlements.assertCanAddProject(organizationId);
    const source = await this.findOne(organizationId, id);

    // Duplicate indicators as well
    const indicators = await this.indicatorModel
      .find({ organizationId: new Types.ObjectId(organizationId), projectId: new Types.ObjectId(id) })
      .lean();

    const { _id, createdAt, updatedAt, ...rest } = source as any;
    const newProject = await this.projectModel.create({
      ...rest,
      _id: undefined,
      name: newName,
      status: 'pipeline',
      isArchived: false,
      startDate: undefined,
      endDate: undefined,
      milestones: [],
      risks: [],
      workplan: [],
      stakeholders: [],
      organizationId: new Types.ObjectId(organizationId),
    });

    // Duplicate indicators (reset achieved data)
    if (indicators.length > 0) {
      await this.indicatorModel.insertMany(
        indicators.map(({ _id: iid, ...ind }) => ({
          ...ind,
          _id: undefined,
          projectId: newProject._id,
          organizationId: new Types.ObjectId(organizationId),
        })),
      );
    }

    await this.audit.record({
      organizationId, actorUserId,
      action: 'project.duplicated', entityType: 'Project', entityId: newProject._id.toString(),
      metadata: { sourceId: id, name: newName },
    });

    return newProject;
  }

  // ─── Data quality refresh ──────────────────────────────────────────────────

  async refreshDataQuality(organizationId: string, id: string) {
    const s = await this.summary(organizationId, id);
    await this.projectModel.updateOne(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      { dataQualityScore: s.summary.dataQualityScore, dataQualityLastChecked: new Date() },
    );
    return { score: s.summary.dataQualityScore, checkedAt: new Date() };
  }

  // ─── Milestones ────────────────────────────────────────────────────────────

  async addMilestone(organizationId: string, projectId: string, dto: Partial<ProjectMilestone>, actorUserId?: string) {
    if (!dto.title || !dto.dueDate) throw new BadRequestException('title and dueDate are required');
    const milestone = { ...dto, _id: new Types.ObjectId(), dueDate: new Date(dto.dueDate as any) };
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $push: { milestones: milestone } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.milestone.added', entityType: 'Project', entityId: projectId, metadata: { title: dto.title } });
    return project;
  }

  async updateMilestone(organizationId: string, projectId: string, milestoneId: string, dto: Partial<ProjectMilestone>, actorUserId?: string) {
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) update[`milestones.$.${k}`] = v;
    }
    if (dto.dueDate)       update['milestones.$.dueDate']       = new Date(dto.dueDate as any);
    if (dto.completedDate) update['milestones.$.completedDate'] = new Date(dto.completedDate as any);
    if (dto.status === 'completed' && !dto.completedDate) {
      update['milestones.$.completedDate'] = new Date();
    }
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId), 'milestones._id': new Types.ObjectId(milestoneId) },
        { $set: update }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Milestone not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.milestone.updated', entityType: 'Project', entityId: projectId, metadata: { milestoneId, status: dto.status } });
    return project;
  }

  async removeMilestone(organizationId: string, projectId: string, milestoneId: string, actorUserId?: string) {
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $pull: { milestones: { _id: new Types.ObjectId(milestoneId) } } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.milestone.removed', entityType: 'Project', entityId: projectId, metadata: { milestoneId } });
    return project;
  }

  // ─── Risks ─────────────────────────────────────────────────────────────────

  async addRisk(organizationId: string, projectId: string, dto: Partial<ProjectRisk>, actorUserId?: string) {
    if (!dto.title) throw new BadRequestException('title is required');
    const risk = { ...dto, _id: new Types.ObjectId() };
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $push: { risks: risk } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.risk.added', entityType: 'Project', entityId: projectId, metadata: { title: dto.title, impact: dto.impact } });
    return project;
  }

  async updateRisk(organizationId: string, projectId: string, riskId: string, dto: Partial<ProjectRisk>, actorUserId?: string) {
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) update[`risks.$.${k}`] = v;
    }
    if (dto.status === 'closed' && !dto.closedDate) {
      update['risks.$.closedDate'] = new Date();
    }
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId), 'risks._id': new Types.ObjectId(riskId) },
        { $set: update }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Risk not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.risk.updated', entityType: 'Project', entityId: projectId, metadata: { riskId, status: dto.status } });
    return project;
  }

  async removeRisk(organizationId: string, projectId: string, riskId: string, actorUserId?: string) {
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $pull: { risks: { _id: new Types.ObjectId(riskId) } } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.risk.removed', entityType: 'Project', entityId: projectId, metadata: { riskId } });
    return project;
  }

  // ─── Workplan ──────────────────────────────────────────────────────────────

  async addWorkplanItem(organizationId: string, projectId: string, dto: Partial<WorkplanItem>, actorUserId?: string) {
    if (!dto.title || !dto.startDate || !dto.endDate) throw new BadRequestException('title, startDate, endDate required');
    const item = { ...dto, _id: new Types.ObjectId(), startDate: new Date(dto.startDate as any), endDate: new Date(dto.endDate as any) };
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $push: { workplan: item } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    await this.audit.record({ organizationId, actorUserId, action: 'project.workplan.added', entityType: 'Project', entityId: projectId, metadata: { title: dto.title } });
    return project;
  }

  async updateWorkplanItem(organizationId: string, projectId: string, itemId: string, dto: Partial<WorkplanItem>, actorUserId?: string) {
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) update[`workplan.$.${k}`] = v;
    }
    if (dto.startDate) update['workplan.$.startDate'] = new Date(dto.startDate as any);
    if (dto.endDate)   update['workplan.$.endDate']   = new Date(dto.endDate as any);
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId), 'workplan._id': new Types.ObjectId(itemId) },
        { $set: update }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Workplan item not found');
    return project;
  }

  async removeWorkplanItem(organizationId: string, projectId: string, itemId: string, actorUserId?: string) {
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $pull: { workplan: { _id: new Types.ObjectId(itemId) } } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── Stakeholders ──────────────────────────────────────────────────────────

  async addStakeholder(organizationId: string, projectId: string, dto: Partial<ProjectStakeholder>) {
    if (!dto.name) throw new BadRequestException('name is required');
    const stakeholder = { ...dto, _id: new Types.ObjectId(), isActive: true };
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $push: { stakeholders: stakeholder } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async updateStakeholder(organizationId: string, projectId: string, stakeholderId: string, dto: Partial<ProjectStakeholder>) {
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) update[`stakeholders.$.${k}`] = v;
    }
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId), 'stakeholders._id': new Types.ObjectId(stakeholderId) },
        { $set: update }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Stakeholder not found');
    return project;
  }

  async removeStakeholder(organizationId: string, projectId: string, stakeholderId: string) {
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, organizationId: new Types.ObjectId(organizationId) },
        { $pull: { stakeholders: { _id: new Types.ObjectId(stakeholderId) } } }, { new: true },
      ).lean();
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private geoPoint(latitude?: number, longitude?: number) {
    return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  }
}