import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkflowService } from '../workflows/workflows.service';
import { Grant, GrantDocument } from './schemas/grant.schema';
import { CreateGrantDto } from './dto/create-grant.dto';
import { UpdateGrantDto } from './dto/update-grant.dto';
import {
  AddDisbursementDto,
  UpdateDisbursementDto,
  AddReportingObligationDto,
  UpdateReportingObligationDto,
  RecordAmendmentDto,
} from './dto/grant-detail.dto';
import { Donor } from '../donors/schemas/donor.schema';
import { Project } from '../projects/schemas/project.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { BudgetAllocation } from '../budget/schemas/budget.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { FxService } from '../fx/fx.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { OrgRole } from '../common/constants/roles';
import { escapeRegex } from '../common/utils/escape-regex';

/** A money total that knows what currency it is in and how it got there. */
export interface ConvertedTotal {
  amount: number;
  currency: string;
  /** Awards whose currency could not be converted, excluded from `amount`. */
  unconvertible: Array<{ currency: string; amount: number }>;
}

@Injectable()
export class GrantsService {
  constructor(
    @InjectModel(Grant.name) private grantModel: Model<GrantDocument>,
    @InjectModel(Donor.name) private donorModel: Model<Donor>,
    @InjectModel(Project.name) private projectModel: Model<Project>,
    @InjectModel(Organization.name) private orgModel: Model<Organization>,
    @InjectModel(BudgetAllocation.name) private budgetModel: Model<BudgetAllocation>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly workflowService: WorkflowService,
    private readonly fx: FxService,
    private readonly webhooks: WebhooksService,
  ) {}

  // ─── Reference integrity ────────────────────────────────────────────────────

  private async assertReferences(organizationId: string, donorId?: string, linkedProjects?: string[]) {
    if (donorId) {
      const donor = await this.donorModel.findOne({
        _id: donorId,
        organizationId: new Types.ObjectId(organizationId),
      });
      if (!donor) {
        throw new NotFoundException('Donor not found');
      }
    }

    if (linkedProjects?.length) {
      const projects = await this.projectModel.find({
        _id: { $in: linkedProjects.map((id) => new Types.ObjectId(id)) },
        organizationId: new Types.ObjectId(organizationId),
      });
      if (projects.length !== linkedProjects.length) {
        throw new NotFoundException('One or more linked projects not found');
      }
    }
  }

  /**
   * Sub-awards are one level deep. Allowing a sub-award to parent another
   * would make portfolio roll-ups double-count, since every level sums its
   * children.
   */
  private async assertValidParent(organizationId: string, parentGrantId: string, selfId?: string) {
    if (selfId && parentGrantId === selfId) {
      throw new BadRequestException('A grant cannot be its own parent award.');
    }
    const parent = await this.grantModel
      .findOne({ _id: parentGrantId, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!parent) throw new NotFoundException('Parent award not found');
    if (parent.parentGrantId) {
      throw new BadRequestException(
        'Sub-awards are limited to one level — the selected award is itself a sub-award.',
      );
    }
    if (selfId) {
      const hasChildren = await this.grantModel.countDocuments({
        organizationId: new Types.ObjectId(organizationId),
        parentGrantId: new Types.ObjectId(selfId),
      });
      if (hasChildren > 0) {
        throw new BadRequestException(
          'This award already has sub-awards, so it cannot become a sub-award itself.',
        );
      }
    }
    return parent;
  }

  // ─── Currency ───────────────────────────────────────────────────────────────

  async baseCurrencyFor(organizationId: string): Promise<string> {
    const org = await this.orgModel.findById(organizationId).select('baseCurrency').lean();
    return (org?.baseCurrency ?? 'USD').toUpperCase();
  }

  /**
   * Sum money across grants that may be denominated differently.
   *
   * Anything that cannot be converted is reported separately rather than
   * folded in at 1:1 — silently adding KES to USD was the original defect.
   */
  private async sumConverted(
    rows: Array<{ amount: number; currency?: string; exchangeRate?: number | null }>,
    baseCurrency: string,
  ): Promise<ConvertedTotal> {
    let total = 0;
    const unconvertibleBy = new Map<string, number>();

    for (const row of rows) {
      const amount = row.amount ?? 0;
      if (!amount) continue;
      const currency = (row.currency ?? baseCurrency).toUpperCase();
      const res = await this.fx.convert(amount, currency, baseCurrency, row.exchangeRate);
      if (res.source === 'unavailable') {
        unconvertibleBy.set(currency, (unconvertibleBy.get(currency) ?? 0) + amount);
      } else {
        total += res.amount;
      }
    }

    return {
      amount: Math.round(total * 100) / 100,
      currency: baseCurrency,
      unconvertible: [...unconvertibleBy.entries()].map(([currency, amount]) => ({ currency, amount })),
    };
  }

  // ─── Derived fields ─────────────────────────────────────────────────────────

  /** Earliest still-outstanding obligation, denormalised for dashboard queries. */
  private computeNextReportDue(grant: Pick<Grant, 'reportingSchedule'>): Date | null {
    const open = (grant.reportingSchedule ?? [])
      .filter((o) => o.status === 'pending' || o.status === 'overdue')
      .map((o) => new Date(o.dueDate).getTime())
      .sort((a, b) => a - b);
    return open.length ? new Date(open[0]) : null;
  }

  private disbursedTotal(grant: Pick<Grant, 'disbursements'>): number {
    return (grant.disbursements ?? [])
      .filter((d) => d.status === 'received')
      .reduce((sum, d) => sum + (d.amount ?? 0), 0);
  }

  /** Re-derive everything that hangs off the sub-documents, then persist. */
  private async recompute(grantDoc: GrantDocument): Promise<GrantDocument> {
    const now = Date.now();
    for (const o of grantDoc.reportingSchedule ?? []) {
      if (o.status === 'pending' && new Date(o.dueDate).getTime() < now) {
        o.status = 'overdue';
      }
    }
    grantDoc.nextReportDue = this.computeNextReportDue(grantDoc);
    return grantDoc.save();
  }

  /**
   * Seed a reporting schedule from the legacy booleans so existing grants get
   * real deadlines instead of an empty tracker.
   */
  private defaultSchedule(grant: {
    startDate: Date;
    endDate: Date;
    requiresMonthlyReporting?: boolean;
    requiresFinalReport?: boolean;
  }) {
    const out: Array<{ dueDate: Date; type: string; status: string }> = [];
    const start = new Date(grant.startDate);
    const end = new Date(grant.endDate);

    if (grant.requiresMonthlyReporting) {
      const cursor = new Date(start);
      cursor.setMonth(cursor.getMonth() + 1);
      while (cursor < end) {
        out.push({ dueDate: new Date(cursor), type: 'narrative', status: 'pending' });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    if (grant.requiresFinalReport) {
      const final = new Date(end);
      final.setDate(final.getDate() + 30); // customary 30-day final-report window
      out.push({ dueDate: final, type: 'final', status: 'pending' });
    }
    return out;
  }

  // ─── Core CRUD ──────────────────────────────────────────────────────────────

  async create(organizationId: string, createGrantDto: CreateGrantDto, userId?: string): Promise<GrantDocument> {
    await this.assertReferences(organizationId, createGrantDto.donorId, createGrantDto.linkedProjects);
    if (createGrantDto.parentGrantId) {
      await this.assertValidParent(organizationId, createGrantDto.parentGrantId);
    }

    const grant = new this.grantModel({
      ...createGrantDto,
      organizationId: new Types.ObjectId(organizationId),
      donorId: createGrantDto.donorId ? new Types.ObjectId(createGrantDto.donorId) : undefined,
      parentGrantId: createGrantDto.parentGrantId
        ? new Types.ObjectId(createGrantDto.parentGrantId)
        : null,
      subRecipientPartnerId: createGrantDto.subRecipientPartnerId
        ? new Types.ObjectId(createGrantDto.subRecipientPartnerId)
        : undefined,
      linkedProjects: createGrantDto.linkedProjects?.map(id => new Types.ObjectId(id)),
    });

    if (!grant.reportingSchedule?.length) {
      grant.reportingSchedule = this.defaultSchedule(grant) as any;
    }
    grant.nextReportDue = this.computeNextReportDue(grant);

    const saved = await grant.save();

    await this.notifications.notifyRoles(
      organizationId,
      [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE],
      {
        type: 'grant.created',
        title: `Grant created: ${saved.name}`,
        message: `A new grant has been added and is ready for allocation planning.`,
        entityType: 'grant',
        entityId: saved._id.toString(),
        link: `/grants/${saved._id}`,
      },
    );

    // New grants kick off the org's default grant workflow, if configured.
    if (userId) {
      this.workflowService.autoStartForEntity(
        organizationId, 'grant', saved._id.toString(), saved.name, userId,
      ).catch(() => {});
    }

    return saved;
  }

  async findAll(organizationId: string, filters?: {
    status?: string;
    donorId?: string;
    search?: string;
    parentGrantId?: string | null;
    primeOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ data: GrantDocument[]; total: number; page: number; pages: number }> {
    const query: any = { organizationId: new Types.ObjectId(organizationId) };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.donorId) {
      query.donorId = new Types.ObjectId(filters.donorId);
    }

    if (filters?.primeOnly) {
      query.parentGrantId = null;
    } else if (filters?.parentGrantId) {
      query.parentGrantId = new Types.ObjectId(filters.parentGrantId);
    }

    if (filters?.search) {
      // Escaped: an unescaped user string here is a ReDoS vector against Mongo.
      const rx = new RegExp(escapeRegex(filters.search), 'i');
      query.$or = [{ name: rx }, { description: rx }, { subRecipientName: rx }];
    }

    const page  = Math.max(1, filters?.page  ?? 1);
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 50));
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.grantModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy']),
      this.grantModel.countDocuments(query),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, organizationId: string): Promise<GrantDocument> {
    const grant = await this.grantModel
      .findById(id)
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .exec();

    if (!grant) {
      throw new NotFoundException('Grant not found');
    }

    if (grant.organizationId.toString() !== organizationId) {
      throw new ForbiddenException('Access denied');
    }

    return grant;
  }

  async update(id: string, organizationId: string, updateGrantDto: UpdateGrantDto): Promise<GrantDocument> {
    await this.assertReferences(organizationId, updateGrantDto.donorId, updateGrantDto.linkedProjects);
    if (updateGrantDto.parentGrantId) {
      await this.assertValidParent(organizationId, updateGrantDto.parentGrantId, id);
    }
    const before = await this.findOne(id, organizationId);

    const updateData: Record<string, any> = {
      ...updateGrantDto,
      donorId: updateGrantDto.donorId ? new Types.ObjectId(updateGrantDto.donorId) : undefined,
      parentGrantId: updateGrantDto.parentGrantId
        ? new Types.ObjectId(updateGrantDto.parentGrantId)
        : undefined,
      linkedProjects: updateGrantDto.linkedProjects?.map(pid => new Types.ObjectId(pid)),
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updated = await this.grantModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .exec();

    if (!updated) {
      throw new NotFoundException('Grant not found');
    }

    // A direct amount change can drop the ceiling below recorded spend.
    if (updateData.amount !== undefined || updateData.amountSpent !== undefined) {
      this.applyOverspendFlags(updated);
      await updated.save();
    }
    if (updateData.reportingSchedule !== undefined) {
      await this.recompute(updated);
    }

    await this.audit.record({
      organizationId,
      action: 'grant.updated',
      entityType: 'Grant',
      entityId: id,
      before: (before as any).toObject ? (before as any).toObject() : before,
      after: updated,
      metadata: { fields: Object.keys(updateData) },
    });

    await this.notifications.notifyRoles(
      organizationId,
      [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE],
      {
        type: 'grant.updated',
        title: `Grant updated: ${updated.name}`,
        message: `A grant record has been updated. Review the latest funding details.`,
        entityType: 'grant',
        entityId: updated._id.toString(),
        link: `/grants/${updated._id}`,
      },
    );

    return updated;
  }

  async remove(id: string, organizationId: string, actorUserId?: string): Promise<GrantDocument> {
    const grant = await this.findOne(id, organizationId);

    const subAwards = await this.grantModel.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
      parentGrantId: new Types.ObjectId(id),
    });
    if (subAwards > 0) {
      throw new BadRequestException(
        `Cannot delete "${grant.name}" — it holds ${subAwards} sub-award(s). Delete or reassign them first.`,
      );
    }

    const deleted = await this.grantModel.findByIdAndDelete(id).exec();

    if (!deleted) {
      throw new NotFoundException('Grant not found');
    }

    await this.audit.record({
      organizationId,
      actorUserId: actorUserId ?? 'system',
      action: 'grant.deleted',
      entityType: 'Grant',
      entityId: id,
      metadata: { name: grant.name, amount: grant.amount },
    });

    return deleted;
  }

  // ─── Disbursements ──────────────────────────────────────────────────────────

  async addDisbursement(id: string, organizationId: string, dto: AddDisbursementDto, actorUserId?: string) {
    const grant = await this.findOne(id, organizationId);
    grant.disbursements.push({
      ...dto,
      plannedDate: new Date(dto.plannedDate),
      receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
      currency: dto.currency ?? grant.currency,
    } as any);
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.disbursement_added', entityType: 'Grant', entityId: id,
      metadata: { amount: dto.amount, status: dto.status },
    });
    return this.withDerived(grant, organizationId);
  }

  async updateDisbursement(
    id: string, disbursementId: string, organizationId: string,
    dto: UpdateDisbursementDto, actorUserId?: string,
  ) {
    const grant = await this.findOne(id, organizationId);
    const row = (grant.disbursements as any).id(disbursementId);
    if (!row) throw new NotFoundException('Disbursement not found');

    Object.assign(row, {
      ...dto,
      plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : row.plannedDate,
      receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : row.receivedDate,
    });
    // Marking a tranche received without a date leaves reconciliation blind.
    if (row.status === 'received' && !row.receivedDate) row.receivedDate = new Date();
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.disbursement_updated', entityType: 'Grant', entityId: id,
      metadata: { disbursementId, status: row.status },
    });
    return this.withDerived(grant, organizationId);
  }

  async removeDisbursement(id: string, disbursementId: string, organizationId: string, actorUserId?: string) {
    const grant = await this.findOne(id, organizationId);
    const row = (grant.disbursements as any).id(disbursementId);
    if (!row) throw new NotFoundException('Disbursement not found');
    row.deleteOne();
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.disbursement_removed', entityType: 'Grant', entityId: id,
      metadata: { disbursementId },
    });
    return this.withDerived(grant, organizationId);
  }

  // ─── Reporting obligations ──────────────────────────────────────────────────

  async addObligation(id: string, organizationId: string, dto: AddReportingObligationDto, actorUserId?: string) {
    const grant = await this.findOne(id, organizationId);
    grant.reportingSchedule.push({
      ...dto,
      dueDate: new Date(dto.dueDate),
      reportingPeriodId: dto.reportingPeriodId ? new Types.ObjectId(dto.reportingPeriodId) : undefined,
    } as any);
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.obligation_added', entityType: 'Grant', entityId: id,
      metadata: { dueDate: dto.dueDate, type: dto.type },
    });
    return this.withDerived(grant, organizationId);
  }

  async updateObligation(
    id: string, obligationId: string, organizationId: string,
    dto: UpdateReportingObligationDto, actorUserId?: string,
  ) {
    const grant = await this.findOne(id, organizationId);
    const row = (grant.reportingSchedule as any).id(obligationId);
    if (!row) throw new NotFoundException('Reporting obligation not found');

    Object.assign(row, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : row.dueDate,
      submittedDate: dto.submittedDate ? new Date(dto.submittedDate) : row.submittedDate,
    });
    if (row.status === 'submitted' && !row.submittedDate) row.submittedDate = new Date();
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.obligation_updated', entityType: 'Grant', entityId: id,
      metadata: { obligationId, status: row.status },
    });
    return this.withDerived(grant, organizationId);
  }

  async removeObligation(id: string, obligationId: string, organizationId: string, actorUserId?: string) {
    const grant = await this.findOne(id, organizationId);
    const row = (grant.reportingSchedule as any).id(obligationId);
    if (!row) throw new NotFoundException('Reporting obligation not found');
    row.deleteOne();
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.obligation_removed', entityType: 'Grant', entityId: id,
      metadata: { obligationId },
    });
    return this.withDerived(grant, organizationId);
  }

  // ─── Amendments ─────────────────────────────────────────────────────────────

  /**
   * Record an approved change and apply it to the live award in one step, so
   * `amount`/`endDate` can never drift from the amendment history.
   */
  async recordAmendment(id: string, organizationId: string, dto: RecordAmendmentDto, actorUserId?: string) {
    const grant = await this.findOne(id, organizationId);

    const previousAmount = grant.amount;
    const previousEndDate = grant.endDate;

    if (dto.newEndDate) {
      const newEnd = new Date(dto.newEndDate);
      if (newEnd < new Date(grant.startDate)) {
        throw new BadRequestException('The revised end date precedes the award start date.');
      }
      grant.endDate = newEnd;
    }
    if (dto.newAmount !== undefined) {
      if (dto.newAmount < 0) throw new BadRequestException('Revised amount cannot be negative.');
      grant.amount = dto.newAmount;
    }

    grant.amendments.push({
      effectiveDate: new Date(dto.effectiveDate),
      type: dto.type,
      reason: dto.reason,
      donorReference: dto.donorReference,
      previousAmount,
      newAmount: dto.newAmount ?? previousAmount,
      previousEndDate,
      newEndDate: dto.newEndDate ? new Date(dto.newEndDate) : previousEndDate,
      recordedBy: actorUserId ? new Types.ObjectId(actorUserId) : undefined,
      recordedAt: new Date(),
    } as any);

    if (dto.type === 'termination') grant.status = 'closed';

    // A budget revision can pull the ceiling below what has already been spent.
    this.applyOverspendFlags(grant);
    await this.recompute(grant);

    await this.audit.record({
      organizationId, actorUserId,
      action: 'grant.amended', entityType: 'Grant', entityId: id,
      reason: dto.reason,
      before: { amount: previousAmount, endDate: previousEndDate },
      after: { amount: grant.amount, endDate: grant.endDate },
      metadata: { type: dto.type },
    });

    await this.notifications.notifyRoles(
      organizationId,
      [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE],
      {
        type: 'grant.amended',
        title: `Grant amended: ${grant.name}`,
        message: `A ${dto.type.replace(/_/g, ' ')} was recorded. ${dto.reason}`,
        entityType: 'grant',
        entityId: id,
        link: `/grants/${id}`,
      },
    );

    return this.withDerived(grant, organizationId);
  }

  // ─── Spend sync ─────────────────────────────────────────────────────────────

  private applyOverspendFlags(grant: GrantDocument) {
    const over = grant.amountSpent > grant.amount;
    grant.isOverspent = over;
    grant.overspendAmount = over
      ? Math.round((grant.amountSpent - grant.amount) * 100) / 100
      : 0;
  }

  /**
   * Record approved expenditure against the award.
   *
   * This deliberately does **not** reject spend above the awarded amount. It
   * used to throw, and its only caller swallowed the exception — so a genuine
   * overspend left `amountSpent` frozen at its last good value and the grant
   * displayed as under budget precisely when it had gone over. Overspend is a
   * real condition: record it, flag it, and tell finance.
   */
  async updateGrantSpending(id: string, organizationId: string, amountSpent: number): Promise<GrantDocument> {
    const grant = await this.findOne(id, organizationId);
    const wasOverspent = grant.isOverspent;

    grant.amountSpent = Math.max(0, amountSpent);
    this.applyOverspendFlags(grant);
    const saved = await grant.save();

    if (saved.isOverspent && !wasOverspent) {
      await this.audit.record({
        organizationId,
        action: 'grant.overspent',
        entityType: 'Grant',
        entityId: id,
        metadata: { amount: saved.amount, amountSpent: saved.amountSpent, overspendAmount: saved.overspendAmount },
      });
      await this.notifications.notifyRoles(
        organizationId,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE],
        {
          type: 'grant.overspent',
          title: `Grant overspent: ${saved.name}`,
          message:
            `Approved expenditure (${saved.currency} ${saved.amountSpent.toLocaleString()}) exceeds the ` +
            `awarded amount by ${saved.currency} ${saved.overspendAmount.toLocaleString()}.`,
          entityType: 'grant',
          entityId: id,
          link: `/grants/${id}`,
        },
      ).catch(() => {});
    }

    return saved;
  }

  // ─── Queries & roll-ups ─────────────────────────────────────────────────────

  /** Attach derived, non-persisted figures for API responses. */
  private async withDerived(grant: GrantDocument, organizationId: string) {
    const base = await this.baseCurrencyFor(organizationId);
    const obj = grant.toObject ? grant.toObject() : (grant as any);
    const disbursed = this.disbursedTotal(obj);
    const converted = await this.fx.convert(obj.amount ?? 0, obj.currency, base, obj.exchangeRate);

    return {
      ...obj,
      disbursedAmount: disbursed,
      undisbursedAmount: Math.max(0, (obj.amount ?? 0) - disbursed),
      remainingAmount: (obj.amount ?? 0) - (obj.amountSpent ?? 0),
      burnRatePct: obj.amount > 0 ? Math.round(((obj.amountSpent ?? 0) / obj.amount) * 100) : 0,
      indirectCostAmount:
        Math.round(((obj.amountSpent ?? 0) * (obj.indirectCostRate ?? 0)) / 100 * 100) / 100,
      matchFundingGapAmount: Math.max(
        0,
        (obj.matchFunding?.requiredAmount ?? 0) - (obj.matchFunding?.securedAmount ?? 0),
      ),
      baseCurrency: base,
      amountInBaseCurrency: converted.source === 'unavailable' ? null : Math.round(converted.amount * 100) / 100,
      exchangeRateUsed: converted.source === 'unavailable' ? null : converted.rate,
      exchangeRateSource: converted.source,
    };
  }

  async getOne(id: string, organizationId: string) {
    const grant = await this.findOne(id, organizationId);
    return this.withDerived(grant, organizationId);
  }

  /**
   * Portfolio totals, converted into the organisation's base currency.
   * Sub-awards are excluded so a prime and its sub don't both count.
   */
  async getBudgetSummary(organizationId: string) {
    const base = await this.baseCurrencyFor(organizationId);
    const grants = await this.grantModel
      .find({ organizationId: new Types.ObjectId(organizationId), status: 'active', parentGrantId: null })
      .lean();

    const awarded = await this.sumConverted(
      grants.map(g => ({ amount: g.amount, currency: g.currency, exchangeRate: g.exchangeRate })),
      base,
    );
    const spent = await this.sumConverted(
      grants.map(g => ({ amount: g.amountSpent, currency: g.currency, exchangeRate: g.exchangeRate })),
      base,
    );
    const disbursed = await this.sumConverted(
      grants.map(g => ({
        amount: this.disbursedTotal(g as any),
        currency: g.currency,
        exchangeRate: g.exchangeRate,
      })),
      base,
    );

    return {
      baseCurrency: base,
      totalGrantAmount: awarded.amount,
      totalSpent: spent.amount,
      totalDisbursed: disbursed.amount,
      remainingBudget: Math.round((awarded.amount - spent.amount) * 100) / 100,
      undisbursedBalance: Math.round((awarded.amount - disbursed.amount) * 100) / 100,
      activeGrants: grants.length,
      overspentGrants: grants.filter(g => g.isOverspent).length,
      // Non-empty when a currency has no known rate — the caller must disclose
      // this rather than present the total as complete.
      unconvertible: awarded.unconvertible,
    };
  }

  async getGrantsByProject(organizationId: string, projectId: string): Promise<GrantDocument[]> {
    const objProjectId = new Types.ObjectId(projectId);
    return this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        linkedProjects: objProjectId,
      })
      .populate(['donorId', 'linkedProjects', 'createdBy', 'updatedBy'])
      .sort({ createdAt: -1 });
  }

  async getExpiringGrants(organizationId: string, daysUntilExpiry: number = 30): Promise<GrantDocument[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysUntilExpiry);

    return this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        status: 'active',
        endDate: { $lte: cutoff, $gte: new Date() },
      })
      .populate(['donorId'])
      .sort({ endDate: 1 });
  }

  /** Upcoming and overdue donor reports across the portfolio. */
  async getUpcomingReports(organizationId: string, withinDays = 90) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + withinDays);

    const grants = await this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        status: { $in: ['active', 'pending'] },
        nextReportDue: { $ne: null, $lte: horizon },
      })
      .populate(['donorId'])
      .sort({ nextReportDue: 1 })
      .lean();

    const now = Date.now();
    return grants.map(g => ({
      grantId: g._id,
      grantName: g.name,
      donor: (g.donorId as any)?.name,
      nextReportDue: g.nextReportDue,
      daysUntilDue: g.nextReportDue
        ? Math.ceil((new Date(g.nextReportDue).getTime() - now) / 86_400_000)
        : null,
      isOverdue: g.nextReportDue ? new Date(g.nextReportDue).getTime() < now : false,
      obligations: (g.reportingSchedule ?? []).filter(o => o.status === 'pending' || o.status === 'overdue'),
    }));
  }

  /** A prime award with its sub-awards and the committed/remaining split. */
  async getAwardTree(id: string, organizationId: string) {
    const prime = await this.findOne(id, organizationId);
    if (prime.parentGrantId) {
      throw new BadRequestException('Award tree is rooted at a prime award; this grant is a sub-award.');
    }

    const subs = await this.grantModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        parentGrantId: new Types.ObjectId(id),
      })
      .sort({ createdAt: 1 })
      .lean();

    const base = await this.baseCurrencyFor(organizationId);
    const committed = await this.sumConverted(
      subs.map(s => ({ amount: s.amount, currency: s.currency, exchangeRate: s.exchangeRate })),
      base,
    );
    const primeInBase = await this.fx.convert(prime.amount, prime.currency, base, prime.exchangeRate);

    return {
      prime: await this.withDerived(prime, organizationId),
      subAwards: subs,
      baseCurrency: base,
      subAwardCount: subs.length,
      committedToSubAwards: committed.amount,
      retainedByPrime:
        primeInBase.source === 'unavailable'
          ? null
          : Math.round((primeInBase.amount - committed.amount) * 100) / 100,
      overCommitted:
        primeInBase.source !== 'unavailable' && committed.amount > primeInBase.amount,
      unconvertible: committed.unconvertible,
    };
  }

  /**
   * Grant-level financial position, rolled up from the budget allocations
   * that carry `grantId`.
   *
   * The budget module already tracked cost categories, commitments, burn rate
   * and alert thresholds, but nothing joined them back to the award — the link
   * existed only as a query filter. This is that join.
   */
  async getFinancialRollup(id: string, organizationId: string) {
    const grant = await this.findOne(id, organizationId);
    const allocations = await this.budgetModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        grantId: new Types.ObjectId(id),
        isDeleted: false,
      })
      .lean();

    const sum = (pick: (a: any) => number) =>
      allocations.reduce((acc, a) => acc + (pick(a) ?? 0), 0);

    const allocated   = sum(a => a.allocatedAmount);
    const spent       = sum(a => a.spentAmount);
    const committed   = sum(a => a.committedAmount);
    const uncommitted = sum(a => a.uncommittedAmount);

    // Cost-category breakdown — what donors actually ask for at report time.
    const byCategory = new Map<string, { allocated: number; spent: number; committed: number }>();
    for (const a of allocations) {
      const key = a.category ?? 'uncategorised';
      const row = byCategory.get(key) ?? { allocated: 0, spent: 0, committed: 0 };
      row.allocated += a.allocatedAmount ?? 0;
      row.spent     += a.spentAmount ?? 0;
      row.committed += a.committedAmount ?? 0;
      byCategory.set(key, row);
    }

    // Burn rate against elapsed award time: spending 80% of the money in 40%
    // of the period is the signal, not the raw percentage.
    const start = new Date(grant.startDate).getTime();
    const end   = new Date(grant.endDate).getTime();
    const now   = Date.now();
    const elapsedPct = end > start
      ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
      : 0;
    const spendPct = grant.amount > 0 ? Math.round((grant.amountSpent / grant.amount) * 100) : 0;

    const breachedThresholds = allocations.flatMap((a: any) =>
      (a.alertThresholds ?? [])
        .filter((t: any) => {
          const pct = a.allocatedAmount > 0 ? (a.spentAmount / a.allocatedAmount) * 100 : 0;
          return t.percentage !== undefined && pct >= t.percentage;
        })
        .map((t: any) => ({ allocation: a.name, category: a.category, threshold: t.percentage })),
    );

    return {
      grantId: id,
      currency: grant.currency,
      award: {
        amount: grant.amount,
        amountSpent: grant.amountSpent,
        remaining: grant.amount - grant.amountSpent,
        isOverspent: grant.isOverspent,
        overspendAmount: grant.overspendAmount,
        indirectCostRate: grant.indirectCostRate,
      },
      budget: {
        allocationCount: allocations.length,
        allocated,
        spent,
        committed,
        uncommitted,
        /** Award money not yet pushed into any allocation. */
        unallocated: Math.round((grant.amount - allocated) * 100) / 100,
        overAllocated: allocated > grant.amount,
      },
      byCategory: [...byCategory.entries()].map(([category, v]) => ({
        category,
        ...v,
        utilisationPct: v.allocated > 0 ? Math.round((v.spent / v.allocated) * 100) : 0,
      })),
      burnRate: {
        spendPct,
        elapsedPct,
        /** Positive means spending is running ahead of the calendar. */
        variancePct: spendPct - elapsedPct,
        status:
          spendPct - elapsedPct > 15 ? 'ahead'
          : spendPct - elapsedPct < -15 ? 'behind'
          : 'on_track',
      },
      breachedThresholds,
    };
  }

  /**
   * Daily sweep firing `grant.expiring` for awards entering the 30-day
   * window. This was a declared webhook event with no dispatcher, so
   * subscribers never heard about an award about to close.
   *
   * `expiryNotifiedAt` makes it idempotent — without it the same grant would
   * re-fire every night for 30 nights.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async dispatchExpiringGrants(withinDays = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);

    const due = await this.grantModel.find({
      status: 'active',
      endDate: { $gte: new Date(), $lte: cutoff },
      $or: [{ expiryNotifiedAt: null }, { expiryNotifiedAt: { $exists: false } }],
    }).lean();

    let fired = 0;
    for (const g of due) {
      const orgId = g.organizationId.toString();
      const daysRemaining = Math.ceil(
        (new Date(g.endDate).getTime() - Date.now()) / 86_400_000,
      );

      await this.webhooks.dispatch(
        orgId,
        'grant.expiring',
        {
          grantId: g._id.toString(),
          name: g.name,
          endDate: g.endDate,
          daysRemaining,
          currency: g.currency,
          amount: g.amount,
        },
        g.linkedProjects?.[0]?.toString(),
      ).catch(() => {});

      await this.notifications.notifyRoles(
        orgId,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE],
        {
          type: 'grant.expiring',
          title: `Grant expiring: ${g.name}`,
          message: `${g.name} closes in ${daysRemaining} day(s). Confirm final reporting and disbursements.`,
          entityType: 'grant',
          entityId: g._id.toString(),
          link: `/grants/${g._id}`,
        },
      ).catch(() => {});

      await this.grantModel.updateOne({ _id: g._id }, { $set: { expiryNotifiedAt: new Date() } });
      fired++;
    }
    return fired;
  }

  /** Nightly sweep so obligations flip to overdue without waiting for a read. */
  async markOverdueReports(): Promise<number> {
    const now = new Date();
    const grants = await this.grantModel.find({
      nextReportDue: { $ne: null, $lt: now },
      status: { $in: ['active', 'pending'] },
    });
    let touched = 0;
    for (const g of grants) {
      const before = JSON.stringify(g.reportingSchedule.map(o => o.status));
      await this.recompute(g);
      if (JSON.stringify(g.reportingSchedule.map(o => o.status)) !== before) touched++;
    }
    return touched;
  }
}
