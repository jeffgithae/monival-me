import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
import { AddEngagementDto } from './dto/add-engagement.dto';
import { AddComplianceConditionDto, UpdateComplianceConditionDto } from './dto/add-compliance-condition.dto';
import { Donor, DonorDocument } from './schemas/donor.schema';
import { Grant, GrantDocument } from '../grants/schemas/grant.schema';
import { BudgetAllocation } from '../budget/schemas/budget.schema';
import { Project } from '../projects/schemas/project.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { paginate, toPaginatedResult } from '../common/types/paginated-results';

@Injectable()
export class DonorsService {
  constructor(
    @InjectModel(Donor.name)            private readonly donorModel: Model<DonorDocument>,
    @InjectModel(Grant.name)            private readonly grantModel: Model<GrantDocument>,
    @InjectModel(BudgetAllocation.name) private readonly budgetModel: Model<BudgetAllocation>,
    @InjectModel(Project.name)          private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name)        private readonly indicatorModel: Model<Indicator>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Core CRUD ──────────────────────────────────────────────────────────────

  async findAll(
    organizationId: string,
    filters?: { status?: string; type?: string; search?: string; tag?: string; page?: number; limit?: number },
  ) {
    const query: Record<string, any> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (filters?.status) query['status'] = filters.status;
    if (filters?.type)   query['type']   = filters.type;
    if (filters?.tag)    query['tags']   = filters.tag;
    if (filters?.search) {
      query['$or'] = [
        { name:      { $regex: filters.search, $options: 'i' } },
        { shortName: { $regex: filters.search, $options: 'i' } },
        { 'address.country': { $regex: filters.search, $options: 'i' } },
        { tags:      { $regex: filters.search, $options: 'i' } },
      ];
    }
    const { page, limit, skip } = paginate(filters?.page, filters?.limit, 200);
    const [data, total] = await Promise.all([
      this.donorModel.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      this.donorModel.countDocuments(query),
    ]);
    return toPaginatedResult(data, total, page, limit);
  }

  async findOne(organizationId: string, id: string) {
    const donor = await this.donorModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!donor) throw new NotFoundException('Donor not found');
    return donor;
  }

  async create(organizationId: string, dto: CreateDonorDto, actorUserId?: string) {
    const donor = await this.donorModel.create({
      organizationId: new Types.ObjectId(organizationId),
      ...dto,
      signedAgreementDate: dto.signedAgreementDate
        ? new Date(dto.signedAgreementDate)
        : undefined,
    });

    await Promise.all([
      this.audit.record({
        organizationId,
        actorUserId,
        action: 'donor.created',
        entityType: 'donor',
        entityId: donor._id.toString(),
        metadata: { name: donor.name, type: donor.type },
      }),
      this.notifications.notifyRoles(
        organizationId,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE],
        {
          type: 'donor.created',
          title: `New donor added: ${donor.name}`,
          message: `A new ${donor.type} donor has been registered. Review and link grants as needed.`,
          entityType: 'donor',
          entityId: donor._id.toString(),
          link: `/donors/${donor._id}`,
        },
        actorUserId,
      ),
    ]);

    return donor;
  }

  async update(organizationId: string, id: string, dto: UpdateDonorDto, actorUserId?: string) {
    const existing = await this.findOne(organizationId, id);

    const donor = await this.donorModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          ...dto,
          signedAgreementDate: dto.signedAgreementDate
            ? new Date(dto.signedAgreementDate)
            : undefined,
        },
        { new: true },
      )
      .lean();

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'donor.updated',
      entityType: 'donor',
      entityId: id,
      metadata: { before: existing, after: donor },
    });

    return donor;
  }

  async remove(organizationId: string, id: string, actorUserId?: string) {
    const donor = await this.findOne(organizationId, id);

    // Prevent deletion if active grants exist
    const activeGrants = await this.grantModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      donorId: new Types.ObjectId(id),
      status: 'active',
    });
    if (activeGrants > 0) {
      throw new BadRequestException(
        `Cannot delete donor with ${activeGrants} active grant(s). Close or reassign grants first.`,
      );
    }

    await this.donorModel.deleteOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'donor.deleted',
      entityType: 'donor',
      entityId: id,
      metadata: { name: donor.name },
    });

    return { deleted: true };
  }

  // ─── Engagement log ──────────────────────────────────────────────────────────

  async addEngagement(
    organizationId: string,
    donorId: string,
    dto: AddEngagementDto,
    actorUserId?: string,
  ) {
    await this.findOne(organizationId, donorId); // assert exists

    const engagement = {
      _id: new Types.ObjectId(),
      type: dto.type,
      date: new Date(dto.date),
      summary: dto.summary,
      outcome: dto.outcome,
      recordedBy: actorUserId ? new Types.ObjectId(actorUserId) : undefined,
      relatedGrantId: dto.relatedGrantId ? new Types.ObjectId(dto.relatedGrantId) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const donor = await this.donorModel
      .findByIdAndUpdate(
        donorId,
        { $push: { engagements: { $each: [engagement], $position: 0 } } },
        { new: true },
      )
      .lean();

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'donor.engagement.added',
      entityType: 'donor',
      entityId: donorId,
      metadata: { engagementType: dto.type, date: dto.date },
    });

    return donor;
  }

  async removeEngagement(organizationId: string, donorId: string, engagementId: string, actorUserId?: string) {
    await this.findOne(organizationId, donorId);

    await this.donorModel.findByIdAndUpdate(donorId, {
      $pull: { engagements: { _id: new Types.ObjectId(engagementId) } },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'donor.engagement.removed',
      entityType: 'donor',
      entityId: donorId,
      metadata: { engagementId },
    });

    return { deleted: true };
  }

  // ─── Compliance conditions ───────────────────────────────────────────────────

  async addComplianceCondition(
    organizationId: string,
    donorId: string,
    dto: AddComplianceConditionDto,
    actorUserId?: string,
  ) {
    await this.findOne(organizationId, donorId);

    const condition = {
      _id: new Types.ObjectId(),
      description: dto.description,
      status: dto.status ?? 'pending',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      metDate: dto.metDate ? new Date(dto.metDate) : undefined,
      notes: dto.notes,
    };

    const donor = await this.donorModel
      .findByIdAndUpdate(
        donorId,
        { $push: { complianceConditions: condition } },
        { new: true },
      )
      .lean();

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'donor.compliance.added',
      entityType: 'donor',
      entityId: donorId,
      metadata: { description: dto.description },
    });

    return donor;
  }

  async updateComplianceCondition(
    organizationId: string,
    donorId: string,
    conditionId: string,
    dto: UpdateComplianceConditionDto,
    actorUserId?: string,
  ) {
    await this.findOne(organizationId, donorId);

    const update: Record<string, any> = {};
    if (dto.status  !== undefined) update['complianceConditions.$.status']  = dto.status;
    if (dto.notes   !== undefined) update['complianceConditions.$.notes']   = dto.notes;
    if (dto.metDate !== undefined) update['complianceConditions.$.metDate'] = new Date(dto.metDate);

    await this.donorModel.updateOne(
      { _id: donorId, 'complianceConditions._id': new Types.ObjectId(conditionId) },
      { $set: update },
    );

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'donor.compliance.updated',
      entityType: 'donor',
      entityId: donorId,
      metadata: { conditionId, status: dto.status },
    });

    return this.findOne(organizationId, donorId);
  }

  // ─── Cross-module queries ────────────────────────────────────────────────────

  async findGrantsByDonor(organizationId: string, donorId: string) {
    await this.findOne(organizationId, donorId);
    const grants = await this.grantModel
      .find({ organizationId: new Types.ObjectId(organizationId), donorId: new Types.ObjectId(donorId) })
      .sort({ createdAt: -1 })
      .lean();
    return grants.map(g => this.enrichGrant(g));
  }

  /** Aggregates next report due dates across all grants for this donor */
  async getUpcomingDeadlines(organizationId: string, donorId: string) {
    await this.findOne(organizationId, donorId);
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 86_400_000);

    const grants = await this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        donorId: new Types.ObjectId(donorId),
        status: { $in: ['active', 'awarded'] },
        $or: [
          { nextReportDue: { $lte: in90 } },
          { endDate: { $lte: in90 } },
        ],
      })
      .sort({ nextReportDue: 1 })
      .lean();

    const complianceDue = await this.donorModel
      .findById(donorId)
      .select('complianceConditions')
      .lean();

    const overdueCompliance = (complianceDue?.complianceConditions ?? []).filter(
      c => c.status === 'overdue' || (c.status === 'pending' && c.dueDate && c.dueDate < now),
    );

    return {
      reportsDue: grants
        .filter(g => (g as any).nextReportDue && new Date((g as any).nextReportDue) <= in90)
        .map(g => ({
          grantId: g._id,
          grantTitle: (g as any).title ?? (g as any).name,
          nextReportDue: (g as any).nextReportDue,
          daysUntilDue: (g as any).nextReportDue
            ? Math.ceil((new Date((g as any).nextReportDue).getTime() - now.getTime()) / 86_400_000)
            : null,
        })),
      grantsExpiringSoon: grants
        .filter(g => g.endDate && new Date(g.endDate) <= in90)
        .map(g => ({
          grantId: g._id,
          grantTitle: (g as any).title ?? (g as any).name,
          endDate: g.endDate,
          daysRemaining: g.endDate
            ? Math.ceil((new Date(g.endDate).getTime() - now.getTime()) / 86_400_000)
            : null,
        })),
      overdueComplianceConditions: overdueCompliance,
    };
  }

  /** Indicator performance broken down by this donor's grants/projects */
  async getDonorPerformanceReport(organizationId: string, donorId: string) {
    await this.findOne(organizationId, donorId);

    const grants = await this.grantModel
      .find({ organizationId: new Types.ObjectId(organizationId), donorId: new Types.ObjectId(donorId) })
      .lean();

    const projectIds = [...new Set(grants.flatMap(g => (g.linkedProjects ?? []).map(p => p.toString())))];

    if (!projectIds.length) {
      return { grants: [], projects: [], indicators: [], summary: { totalIndicators: 0, onTrack: 0, atRisk: 0, behind: 0 } };
    }

    const indicators = await this.indicatorModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        projectId: { $in: projectIds.map(id => new Types.ObjectId(id)) },
      })
      .lean();

    const onTrack = indicators.filter(i => (i as any).status === 'on_track').length;
    const atRisk  = indicators.filter(i => (i as any).status === 'at_risk').length;
    const behind  = indicators.filter(i => (i as any).status === 'behind').length;

    const projects = await this.projectModel
      .find({ _id: { $in: projectIds.map(id => new Types.ObjectId(id)) } })
      .select('name status startDate endDate')
      .lean();

    return {
      grants: grants.map(g => this.enrichGrant(g)),
      projects,
      indicators: indicators.map(i => ({
        _id: i._id,
        code: i.code,
        title: i.title,
        status: (i as any).status,
        percentComplete: (i as any).percentComplete,
        trend: (i as any).trend,
        projectId: i.projectId,
      })),
      summary: {
        totalIndicators: indicators.length,
        onTrack,
        atRisk,
        behind,
        averageProgress: indicators.length
          ? Math.round(indicators.reduce((s, i) => s + ((i as any).percentComplete ?? 0), 0) / indicators.length)
          : 0,
      },
    };
  }

  /** Full profile — all cross-module data in one call */
  async getDonorProfile(organizationId: string, donorId: string) {
    const donor   = await this.findOne(organizationId, donorId);
    const grants  = await this.findGrantsByDonor(organizationId, donorId);
    const grantIds = grants.map(g => (g as any)._id);

    const projectIds = [...new Set(
      grants.flatMap(g => ((g as any).linkedProjects ?? []).map((p: any) => p.toString()))
    )];

    const [projects, budgets] = await Promise.all([
      projectIds.length
        ? this.projectModel
            .find({ _id: { $in: projectIds.map(id => new Types.ObjectId(id)) } })
            .select('name status startDate endDate donor donorId')
            .lean()
        : Promise.resolve([]),
      grantIds.length
        ? this.budgetModel
            .find({ organizationId: new Types.ObjectId(organizationId), grantId: { $in: grantIds } })
            .lean()
        : Promise.resolve([]),
    ]);

    const totalAwarded = grants.reduce((s, g) => s + ((g as any).totalAmount ?? 0), 0);
    const totalSpent   = grants.reduce((s, g) => s + ((g as any).spentAmount ?? 0), 0);
    const activeGrants = grants.filter(g => (g as any).status === 'active').length;

    return {
      donor,
      grants,
      projects,
      budgets,
      summary: {
        totalGrants: grants.length,
        activeGrants,
        totalAwarded,
        totalSpent,
        remaining: totalAwarded - totalSpent,
      },
    };
  }

  /** Organisation-level portfolio summary across all donors */
  async getPortfolioSummary(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const now   = new Date();
    const in30  = new Date(now.getTime() + 30 * 86_400_000);

    const [donors, grants] = await Promise.all([
      this.donorModel.find({ organizationId: orgId }).lean(),
      this.grantModel.find({ organizationId: orgId }).lean(),
    ]);

    const countByType:   Record<string, number> = {};
    const countByStatus: Record<string, number> = {};
    donors.forEach(d => {
      const t = (d as any).type   ?? 'other';   countByType[t]   = (countByType[t]   ?? 0) + 1;
      const s = (d as any).status ?? 'active';  countByStatus[s] = (countByStatus[s] ?? 0) + 1;
    });

    const expiringGrants = grants.filter(
      g => g.endDate && new Date(g.endDate) >= now && new Date(g.endDate) <= in30 && g.status !== 'closed',
    );
    const overdueReports = grants.filter(
      g => (g as any).nextReportDue && new Date((g as any).nextReportDue) < now && g.status === 'active',
    );
    const overdueCompliance = await this.donorModel.countDocuments({
      organizationId: orgId,
      'complianceConditions.status': 'overdue',
    });

    return {
      totalDonors:      donors.length,
      totalGrants:      grants.length,
      activeGrants:     grants.filter(g => g.status === 'active').length,
      totalAwarded:     grants.reduce((s, g) => s + ((g as any).totalAmount   ?? g.amount  ?? 0), 0),
      totalSpent:       grants.reduce((s, g) => s + ((g as any).spentAmount   ?? g.amountSpent ?? 0), 0),
      totalDisbursed:   grants.reduce((s, g) => s + ((g as any).disbursedAmount ?? 0), 0),
      remaining:        grants.reduce((s, g) => s + (((g as any).totalAmount ?? g.amount ?? 0) - ((g as any).spentAmount ?? g.amountSpent ?? 0)), 0),
      countByType,
      countByStatus,
      expiringIn30Days: expiringGrants.length,
      overdueReports:   overdueReports.length,
      overdueCompliance,
    };
  }

  /** Audit trail for a specific donor */
  getAuditLog(organizationId: string, donorId: string) {
    return this.audit.list(organizationId, 'donor', donorId);
  }

  /** CSV-compatible flat export of all donors with grant totals */
  async exportPortfolio(organizationId: string): Promise<Record<string, any>[]> {
    const result = await this.findAll(organizationId, { limit: 10000 });
    const donors = result.data;
    const grants = await this.grantModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .lean();

    const grantsByDonor = new Map<string, typeof grants>();
    grants.forEach(g => {
      const key = g.donorId?.toString() ?? '__none__';
      if (!grantsByDonor.has(key)) grantsByDonor.set(key, []);
      grantsByDonor.get(key)!.push(g);
    });

    return donors.map(d => {
      const dGrants    = grantsByDonor.get(d._id.toString()) ?? [];
      const awarded    = dGrants.reduce((s, g) => s + ((g as any).totalAmount  ?? g.amount       ?? 0), 0);
      const spent      = dGrants.reduce((s, g) => s + ((g as any).spentAmount  ?? g.amountSpent ?? 0), 0);
      const active     = dGrants.filter(g => g.status === 'active').length;
      return {
        id:               d._id.toString(),
        name:             d.name,
        shortName:        (d as any).shortName ?? '',
        type:             (d as any).type ?? '',
        status:           (d as any).status ?? '',
        country:          (d as any).address?.country ?? (d as any).country ?? '',
        contactEmail:     (d as any).contactEmail ?? '',
        website:          (d as any).website ?? '',
        reportingCadence: (d as any).reportingCadence ?? '',
        requiresDisaggregation: (d as any).requiresDisaggregation ? 'Yes' : 'No',
        totalGrants:      dGrants.length,
        activeGrants:     active,
        totalAwarded:     awarded,
        totalSpent:       spent,
        remaining:        awarded - spent,
        tags:             ((d as any).tags ?? []).join('; '),
      };
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private enrichGrant(g: any) {
    const now   = Date.now();
    const endMs = g.endDate ? new Date(g.endDate).getTime() : null;
    const daysUntilExpiry = endMs != null ? Math.ceil((endMs - now) / 86_400_000) : null;
    const total    = g.totalAmount  ?? g.amount       ?? 0;
    const spent    = g.spentAmount  ?? g.amountSpent ?? 0;
    const burnRate = total > 0 ? parseFloat(((spent / total) * 100).toFixed(1)) : 0;
    const uncommittedAmount = Math.max(total - spent, 0);
    return { ...g, daysUntilExpiry, burnRate, uncommittedAmount };
  }
}