import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GrantsService } from '../grants/grants.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { OrgRole } from '../common/constants/roles';
import { Beneficiary } from '../beneficiaries/schemas/beneficiary.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Partner } from '../partners/schemas/partner.schema';
import { Project } from '../projects/schemas/project.schema';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateActivityTemplateDto } from './dto/create-activity-template.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { Activity } from './schemas/activity.schema';
import { ActivityTemplate } from './schemas/activity-template.schema';
import { escapeRegex } from '../common/utils/escape-regex';

export interface ActivityListQuery {
  projectId?: string;
  indicatorId?: string;
  beneficiaryId?: string;
  status?: string;
  activityType?: string;
  partnerId?: string;
  grantId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Activity.name)         private readonly activityModel: Model<Activity>,
    @InjectModel(ActivityTemplate.name) private readonly templateModel: Model<ActivityTemplate>,
    @InjectModel(Project.name)          private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name)        private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Partner.name)          private readonly partnerModel: Model<Partner>,
    @InjectModel(Beneficiary.name)      private readonly beneficiaryModel: Model<Beneficiary>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly grantsService: GrantsService,
    private readonly webhooksService: WebhooksService,
  ) {}

  // ─── Validation ────────────────────────────────────────────────────────────

  private async assertRefs(organizationId: string, projectId: string, indicatorId?: string) {
    const project = await this.projectModel.findOne({
      _id: projectId, organizationId: new Types.ObjectId(organizationId),
    });
    if (!project) throw new NotFoundException('Project not found');

    if (indicatorId) {
      const indicator = await this.indicatorModel.findOne({
        _id: indicatorId,
        projectId:      new Types.ObjectId(projectId),
        organizationId: new Types.ObjectId(organizationId),
      });
      if (!indicator) throw new NotFoundException('Indicator not found');
    }
    return project;
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAll(organizationId: string, query: ActivityListQuery = {}) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (query.projectId)    filter.projectId    = new Types.ObjectId(query.projectId);
    if (query.indicatorId)  filter.indicatorId  = new Types.ObjectId(query.indicatorId);
    if (query.beneficiaryId) filter.beneficiaryIds = new Types.ObjectId(query.beneficiaryId);
    if (query.status)       filter.status       = query.status;
    if (query.activityType) filter.activityType = query.activityType;
    if (query.partnerId)    filter.partnerId    = new Types.ObjectId(query.partnerId);
    if (query.grantId)      filter.grantId      = new Types.ObjectId(query.grantId);

    if (query.fromDate || query.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.fromDate) dateFilter.$gte = new Date(query.fromDate);
      if (query.toDate)   dateFilter.$lte = new Date(query.toDate);
      filter.activityDate = dateFilter;
    }

    if (query.search) {
      const re = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ title: re }, { location: re }, { notes: re }];
    }

    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(200, query.limit ?? 50);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.activityModel.find(filter).sort({ activityDate: -1 }).skip(skip).limit(limit).lean(),
      this.activityModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    const activity = await this.activityModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  // ─── Aggregation / statistics ──────────────────────────────────────────────

  async statistics(organizationId: string, projectId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const match: Record<string, unknown> = { organizationId: orgId, status: 'approved' };
    if (projectId) match.projectId = new Types.ObjectId(projectId);

    const [byType, byMonth, byLocation, totals] = await Promise.all([
      // By activity type
      this.activityModel.aggregate([
        { $match: match },
        { $group: { _id: '$activityType', count: { $sum: 1 }, participants: { $sum: '$participants' }, quantity: { $sum: '$quantity' } } },
        { $sort: { count: -1 } },
      ]),
      // By month
      this.activityModel.aggregate([
        { $match: match },
        { $group: {
          _id: { year: { $year: '$activityDate' }, month: { $month: '$activityDate' } },
          count: { $sum: 1 }, participants: { $sum: '$participants' }, quantity: { $sum: '$quantity' },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      // By location (top districts)
      this.activityModel.aggregate([
        { $match: { ...match, district: { $exists: true, $ne: null } } },
        { $group: { _id: '$district', count: { $sum: 1 }, participants: { $sum: '$participants' } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      // Grand totals
      this.activityModel.aggregate([
        { $match: match },
        { $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          totalParticipants: { $sum: '$participants' },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$cost' },
          totalMale: { $sum: '$participantsMale' },
          totalFemale: { $sum: '$participantsFemale' },
          totalUnder18: { $sum: '$participantsUnder18' },
          totalPwd: { $sum: '$participantsPwd' },
          totalIdp: { $sum: '$participantsIdp' },
          totalRefugee: { $sum: '$participantsRefugee' },
        }},
      ]),
    ]);

    const t = totals[0] ?? {};
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        activities:   t.totalActivities   ?? 0,
        participants: t.totalParticipants ?? 0,
        quantity:     t.totalQuantity     ?? 0,
        cost:         t.totalCost         ?? 0,
        breakdown: {
          male:     t.totalMale    ?? 0,
          female:   t.totalFemale  ?? 0,
          under18:  t.totalUnder18 ?? 0,
          pwd:      t.totalPwd     ?? 0,
          idp:      t.totalIdp     ?? 0,
          refugee:  t.totalRefugee ?? 0,
        },
      },
      byType:     byType.map(b => ({ type: b._id ?? 'unknown', count: b.count, participants: b.participants, quantity: b.quantity })),
      byMonth:    byMonth.map(b => ({ year: b._id.year, month: b._id.month, count: b.count, participants: b.participants, quantity: b.quantity })),
      byLocation: byLocation.map(b => ({ district: b._id, count: b.count, participants: b.participants })),
    };
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  findTemplates(organizationId: string, projectId?: string) {
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (projectId) filter.projectId = new Types.ObjectId(projectId);
    return this.templateModel.find(filter).sort({ name: 1 }).lean();
  }

  async createTemplate(organizationId: string, dto: CreateActivityTemplateDto) {
    await this.assertRefs(organizationId, dto.projectId, dto.indicatorId);
    return this.templateModel.create({
      organizationId:      new Types.ObjectId(organizationId),
      projectId:           new Types.ObjectId(dto.projectId),
      name:                dto.name,
      description:         dto.description,
      indicatorId:         dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      defaultLocation:     dto.defaultLocation,
      defaultActivityType: dto.defaultActivityType,
      defaultEvidenceUrl:  dto.defaultEvidenceUrl,
      defaultParticipants: dto.defaultParticipants ?? 0,
      defaultQuantity:     dto.defaultQuantity ?? 0,
      defaultNotes:        dto.defaultNotes,
    });
  }

  async removeTemplate(organizationId: string, id: string) {
    const result = await this.templateModel.deleteOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Template not found');
    return { deleted: true };
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(organizationId: string, dto: CreateActivityDto, role: OrgRole, userId: string) {
    const project = await this.assertRefs(organizationId, dto.projectId, dto.indicatorId);

    if (dto.partnerId) {
      const partner = await this.partnerModel.findOne({ _id: dto.partnerId, organizationId: new Types.ObjectId(organizationId) });
      if (!partner) throw new NotFoundException('Partner not found');
    }
    if (dto.beneficiaryIds?.length) {
      const count = await this.beneficiaryModel.countDocuments({ _id: { $in: dto.beneficiaryIds }, organizationId: new Types.ObjectId(organizationId) });
      if (count !== dto.beneficiaryIds.length) throw new NotFoundException('One or more beneficiaries not found');
    }

    // Determine workflow status
    const shouldRequireApproval = role === OrgRole.FIELD_OFFICER;
    let status: 'draft' | 'submitted' | 'approved' = 'approved';
    if (dto.status === 'draft') {
      status = 'draft';
    } else if (dto.status === 'submitted' || shouldRequireApproval) {
      status = 'submitted';
    }

    // Auto-compute participants total if breakdown supplied but total is 0
    let participants = dto.participants ?? 0;
    const breakdown  = [dto.participantsMale, dto.participantsFemale, dto.participantsOther].filter(Boolean);
    if (participants === 0 && breakdown.length > 0) {
      participants = (dto.participantsMale ?? 0) + (dto.participantsFemale ?? 0) + (dto.participantsOther ?? 0);
    }

    // Quality flags
    const qualityFlags: string[] = [];
    if (!dto.evidenceUrl && !dto.evidenceNotes && project.requiresEvidencePerActivity) {
      qualityFlags.push('missing_evidence');
    }
    if (project.requiresDisaggregation && (!dto.disaggregationData || dto.disaggregationData.length === 0)) {
      qualityFlags.push('missing_disaggregation');
    }

    const activity = await this.activityModel.create({
      organizationId:       new Types.ObjectId(organizationId),
      projectId:            new Types.ObjectId(dto.projectId),
      indicatorId:          dto.indicatorId  ? new Types.ObjectId(dto.indicatorId)  : undefined,
      partnerId:            dto.partnerId    ? new Types.ObjectId(dto.partnerId)    : undefined,
      grantId:              dto.grantId      ? new Types.ObjectId(dto.grantId)      : undefined,
      templateId:           dto.templateId   ? new Types.ObjectId(dto.templateId)   : undefined,
      beneficiaryIds:       dto.beneficiaryIds?.map(b => new Types.ObjectId(b)),
      title:                dto.title,
      description:          dto.description,
      activityDate:         new Date(dto.activityDate),
      activityType:         dto.activityType,
      location:             dto.location,
      country:              dto.country,
      region:               dto.region,
      district:             dto.district,
      village:              dto.village,
      site:                 dto.site,
      geoPoint:             this.geoPoint(dto.latitude, dto.longitude),
      participants,
      quantity:             dto.quantity ?? 0,
      participantsMale:     dto.participantsMale     ?? 0,
      participantsFemale:   dto.participantsFemale   ?? 0,
      participantsOther:    dto.participantsOther    ?? 0,
      participantsUnder18:  dto.participantsUnder18  ?? 0,
      participantsOver60:   dto.participantsOver60   ?? 0,
      participantsPwd:      dto.participantsPwd      ?? 0,
      participantsIdp:      dto.participantsIdp      ?? 0,
      participantsRefugee:  dto.participantsRefugee  ?? 0,
      disaggregationData:   dto.disaggregationData   ?? [],
      cost:                 dto.cost,
      costCurrency:         dto.costCurrency,
      budgetLine:           dto.budgetLine,
      evidenceUrl:          dto.evidenceUrl,
      evidenceNotes:        dto.evidenceNotes,
      hasPhotoEvidence:     dto.hasPhotoEvidence     ?? false,
      hasSignatureSheet:    dto.hasSignatureSheet     ?? false,
      notes:                dto.notes,
      challenges:           dto.challenges,
      recommendations:      dto.recommendations,
      followUpActions:      dto.followUpActions,
      status,
      submittedByUserId:    new Types.ObjectId(userId),
      submittedAt:          status === 'submitted' ? new Date() : undefined,
      qualityFlags,
    } as any);

    if (status === 'submitted') {
      await this.notifications.notifyRoles(
        organizationId,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
        {
          type:       'activity.submitted',
          title:      `Activity submitted: ${activity.title}`,
          message:    `An activity "${activity.title}" has been submitted for review.`,
          entityType: 'activity',
          entityId:   activity._id.toString(),
          link:       `/projects/${dto.projectId}`,
        },
        userId,
      );
    }

    await this.audit.record({
      organizationId, actorUserId: userId,
      action: 'activity.created', entityType: 'Activity',
      entityId: activity._id.toString(),
      metadata: { title: activity.title, status, projectId: dto.projectId },
    });

    return activity;
  }

  // ─── Bulk create ───────────────────────────────────────────────────────────

  async bulkCreate(organizationId: string, dtos: CreateActivityDto[], role: OrgRole, userId: string) {
    const results: any[] = [];
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < dtos.length; i++) {
      try {
        const activity = await this.create(organizationId, dtos[i], role, userId);
        results.push(activity);
      } catch (err: any) {
        errors.push({ index: i, message: err.message });
      }
    }

    return { created: results.length, errors, results };
  }

  // ─── Review ────────────────────────────────────────────────────────────────

  async review(
    organizationId: string,
    id: string,
    reviewerId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string,
  ) {
    const activity = await this.activityModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          status,
          reviewedByUserId: new Types.ObjectId(reviewerId),
          reviewedAt:       new Date(),
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        { new: true },
      ).lean();
    if (!activity) throw new NotFoundException('Activity not found');

    // ── Grant ↔ Activity linkage: recalculate total approved spend ───────────
    if (status === 'approved' && activity.grantId) {
      try {
        const agg = await this.activityModel.aggregate([
          {
            $match: {
              organizationId: new Types.ObjectId(organizationId),
              grantId: activity.grantId,
              status: 'approved',
            },
          },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$cost', 0] } } } },
        ]);
        const totalSpent: number = agg[0]?.total ?? 0;
        await this.grantsService.updateGrantSpending(activity.grantId.toString(), organizationId, totalSpent);
      } catch {
        // Non-blocking — grant update failure must not break activity approval
      }
    }

    // ── Fire webhook events ────────────────────────────────────────────────
    const webhookEvent = status === 'approved'
      ? 'activity.approved'
      : 'activity.rejected';
    this.webhooksService.dispatch(
      organizationId,
      webhookEvent as any,
      { activityId: id, title: activity.title, status, rejectionReason },
      activity.projectId?.toString(),
    ).catch(() => {});

    // Notify the submitter
    if (activity.submittedByUserId) {
      await this.notifications.create({
        organizationId,
        userId:     activity.submittedByUserId.toString(),
        type:       `activity.${status}`,
        title:      `Activity ${status}: ${activity.title}`,
        message:    status === 'rejected' && rejectionReason
          ? `Your activity was rejected: ${rejectionReason}`
          : `Your activity "${activity.title}" has been ${status}.`,
        entityType: 'activity',
        entityId:   activity._id.toString(),
        link:       `/projects/${activity.projectId}`,
      });
    }

    await this.audit.record({
      organizationId, actorUserId: reviewerId,
      action: `activity.${status}`, entityType: 'Activity', entityId: id,
      metadata: { status, rejectionReason },
    });

    return activity;
  }

  // ─── Bulk review ───────────────────────────────────────────────────────────

  async bulkReview(
    organizationId: string,
    ids: string[],
    reviewerId: string,
    status: 'approved' | 'rejected',
  ) {
    const result = await this.activityModel.updateMany(
      {
        _id:            { $in: ids.map(id => new Types.ObjectId(id)) },
        organizationId: new Types.ObjectId(organizationId),
        status:         'submitted',
      },
      {
        status,
        reviewedByUserId: new Types.ObjectId(reviewerId),
        reviewedAt:       new Date(),
      },
    );

    await this.audit.record({
      organizationId, actorUserId: reviewerId,
      action: `activity.bulk_${status}`, entityType: 'Activity',
      metadata: { ids, status, modifiedCount: result.modifiedCount },
    });

    return { modifiedCount: result.modifiedCount };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(organizationId: string, id: string, dto: UpdateActivityDto, actorUserId?: string) {
    if (dto.indicatorId) {
      const existing = await this.activityModel.findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) });
      if (!existing) throw new NotFoundException('Activity not found');
      await this.assertRefs(organizationId, existing.projectId.toString(), dto.indicatorId);
    }

    const updateDoc: Record<string, unknown> = { ...dto };
    if (dto.indicatorId)    updateDoc.indicatorId    = new Types.ObjectId(dto.indicatorId);
    if (dto.activityDate)   updateDoc.activityDate   = new Date(dto.activityDate);
    if (dto.templateId)     updateDoc.templateId     = new Types.ObjectId(dto.templateId);
    if (dto.partnerId)      updateDoc.partnerId      = new Types.ObjectId(dto.partnerId);
    if (dto.grantId)        updateDoc.grantId        = new Types.ObjectId(dto.grantId);
    if (dto.beneficiaryIds) updateDoc.beneficiaryIds = dto.beneficiaryIds.map(b => new Types.ObjectId(b));
    const gp = this.geoPoint(dto.latitude, dto.longitude);
    if (gp) updateDoc.geoPoint = gp;
    delete updateDoc.latitude;
    delete updateDoc.longitude;
    delete updateDoc.projectId;

    const activity = await this.activityModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        updateDoc,
        { new: true },
      ).lean();
    if (!activity) throw new NotFoundException('Activity not found');

    await this.audit.record({
      organizationId, actorUserId,
      action: 'activity.updated', entityType: 'Activity', entityId: id,
      metadata: { fields: Object.keys(dto) },
    });

    return activity;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(organizationId: string, id: string, actorUserId?: string) {
    const result = await this.activityModel.deleteOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Activity not found');
    await this.audit.record({
      organizationId, actorUserId,
      action: 'activity.deleted', entityType: 'Activity', entityId: id,
    });
    return { deleted: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private geoPoint(latitude?: number, longitude?: number) {
    return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  }
}