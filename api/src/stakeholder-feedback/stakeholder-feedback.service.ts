import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  StakeholderFeedback,
  StakeholderFeedbackDocument,
  FeedbackStatus,
} from './schemas/stakeholder-feedback.schema';
import { escapeRegex } from '../common/utils/escape-regex';

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateFeedbackDto {
  projectId?: string;
  indicatorId?: string;
  activityId?: string;
  beneficiaryId?: string;
  title: string;
  content: string;
  channel?: string;
  sentiment?: string;
  sentimentScore?: number;
  thematicTags?: string[];
  respondentName?: string;
  respondentContact?: string;
  respondentSex?: string;
  respondentAge?: number;
  respondentLocation?: string;
  isAnonymous?: boolean;
  consentToPublish?: boolean;
  collectedAt?: string;
  media?: Array<{ url: string; type?: string; caption?: string }>;
}

export interface FeedbackListQuery {
  projectId?: string;
  indicatorId?: string;
  status?: string;
  channel?: string;
  sentiment?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class StakeholderFeedbackService {
  constructor(
    @InjectModel(StakeholderFeedback.name)
    private readonly model: Model<StakeholderFeedbackDocument>,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    collectedByUserId: string,
    dto: CreateFeedbackDto,
  ): Promise<StakeholderFeedbackDocument> {
    if (!dto.title?.trim() || !dto.content?.trim()) {
      throw new BadRequestException('Title and content are required.');
    }
    return this.model.create({
      organizationId:    new Types.ObjectId(organizationId),
      collectedByUserId: new Types.ObjectId(collectedByUserId),
      projectId:         dto.projectId   ? new Types.ObjectId(dto.projectId)   : undefined,
      indicatorId:       dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      activityId:        dto.activityId  ? new Types.ObjectId(dto.activityId)  : undefined,
      beneficiaryId:     dto.beneficiaryId ? new Types.ObjectId(dto.beneficiaryId) : undefined,
      title:             dto.title.trim(),
      content:           dto.content.trim(),
      channel:           dto.channel ?? 'survey',
      sentiment:         dto.sentiment,
      sentimentScore:    dto.sentimentScore,
      thematicTags:      dto.thematicTags ?? [],
      respondentName:    dto.isAnonymous ? undefined : dto.respondentName,
      respondentContact: dto.isAnonymous ? undefined : dto.respondentContact,
      respondentSex:     dto.respondentSex,
      respondentAge:     dto.respondentAge,
      respondentLocation: dto.respondentLocation,
      isAnonymous:       dto.isAnonymous ?? false,
      consentToPublish:  dto.consentToPublish ?? false,
      collectedAt:       dto.collectedAt ? new Date(dto.collectedAt) : new Date(),
      media:             dto.media ?? [],
      status:            FeedbackStatus.RECEIVED,
    });
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async findAll(organizationId: string, query: FeedbackListQuery = {}) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (query.projectId)  filter.projectId  = new Types.ObjectId(query.projectId);
    if (query.indicatorId) filter.indicatorId = new Types.ObjectId(query.indicatorId);
    if (query.status)     filter.status     = query.status;
    if (query.channel)    filter.channel    = query.channel;
    if (query.sentiment)  filter.sentiment  = query.sentiment;

    if (query.search) {
      const re = escapeRegex(query.search);
      filter.$or = [
        { title:   { $regex: re, $options: 'i' } },
        { content: { $regex: re, $options: 'i' } },
        { thematicTags: { $regex: re, $options: 'i' } },
      ];
    }

    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── Single ─────────────────────────────────────────────────────────────────

  async findOne(organizationId: string, id: string): Promise<StakeholderFeedbackDocument> {
    const doc = await this.model.findOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    });
    if (!doc) throw new NotFoundException('Feedback not found.');
    return doc;
  }

  // ── Update status & add action log ─────────────────────────────────────────

  async action(
    organizationId: string,
    id: string,
    actorUserId: string,
    status: FeedbackStatus,
    action: string,
    notes?: string,
  ): Promise<StakeholderFeedbackDocument> {
    const doc = await this.findOne(organizationId, id);
    doc.status = status;
    doc.actionsLog = [
      ...(doc.actionsLog ?? []),
      {
        action,
        takenAt: new Date(),
        byUserId: new Types.ObjectId(actorUserId) as any,
        notes,
      },
    ];
    if (notes) doc.responseNotes = notes;
    return doc.save();
  }

  // ── AI sentiment + summary enrichment (called by copilot) ─────────────────

  async enrichWithAI(
    organizationId: string,
    id: string,
    aiSummary: string,
    aiConfidence: number,
    sentimentScore?: number,
    sentiment?: string,
  ): Promise<StakeholderFeedbackDocument> {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      { $set: { aiSummary, aiConfidence, sentimentScore, sentiment } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Feedback not found.');
    return doc;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async remove(organizationId: string, id: string): Promise<{ deleted: boolean }> {
    const result = await this.model.deleteOne({
      _id: id, organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Feedback not found.');
    return { deleted: true };
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  async analytics(organizationId: string, projectId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const match: Record<string, unknown> = { organizationId: orgId };
    if (projectId) match.projectId = new Types.ObjectId(projectId);

    const [bySentiment, byChannel, byStatus, byTheme, sentimentTrend, totals] =
      await Promise.all([
        this.model.aggregate([
          { $match: match },
          { $group: { _id: '$sentiment', count: { $sum: 1 }, avgScore: { $avg: '$sentimentScore' } } },
        ]),
        this.model.aggregate([
          { $match: match },
          { $group: { _id: '$channel', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        this.model.aggregate([
          { $match: match },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        this.model.aggregate([
          { $match: { ...match, thematicTags: { $exists: true, $ne: [] } } },
          { $unwind: '$thematicTags' },
          { $group: { _id: '$thematicTags', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ]),
        // Sentiment trend by month (last 6 months)
        this.model.aggregate([
          {
            $match: {
              ...match,
              createdAt: { $gte: new Date(Date.now() - 180 * 86400000) },
            },
          },
          {
            $group: {
              _id: {
                year:  { $year: '$createdAt' },
                month: { $month: '$createdAt' },
              },
              avgScore: { $avg: '$sentimentScore' },
              count:    { $sum: 1 },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]),
        this.model.aggregate([
          { $match: match },
          {
            $group: {
              _id:             null,
              total:           { $sum: 1 },
              avgScore:        { $avg: '$sentimentScore' },
              withEvidence:    { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$media', []] } }, 0] }, 1, 0] } },
              withConsent:     { $sum: { $cond: ['$consentToPublish', 1, 0] } },
              actioned:        { $sum: { $cond: [{ $in: ['$status', ['actioned', 'closed']] }, 1, 0] } },
            },
          },
        ]),
      ]);

    const t = totals[0] ?? {};
    return {
      totals: {
        total:       t.total        ?? 0,
        avgScore:    t.avgScore     ? Math.round(t.avgScore) : null,
        withEvidence: t.withEvidence ?? 0,
        withConsent: t.withConsent  ?? 0,
        actionedPct: t.total > 0 ? Math.round((t.actioned / t.total) * 100) : 0,
      },
      bySentiment:   Object.fromEntries(bySentiment.map(r => [r._id ?? 'unscored', { count: r.count, avgScore: r.avgScore }])),
      byChannel:     byChannel.map(r => ({ channel: r._id, count: r.count })),
      byStatus:      Object.fromEntries(byStatus.map(r => [r._id, r.count])),
      topThemes:     byTheme.map(r => ({ theme: r._id, count: r.count })),
      sentimentTrend: sentimentTrend.map(r => ({
        year: r._id.year, month: r._id.month,
        avgScore: r.avgScore ? Math.round(r.avgScore) : null,
        count: r.count,
      })),
    };
  }

  // ── Project cascade cleanup ─────────────────────────────────────────────────
  async unscopeFromProject(organizationId: string, projectId: string) {
    const result = await this.model.updateMany(
      { organizationId: new Types.ObjectId(organizationId), projectId: new Types.ObjectId(projectId) },
      { $unset: { projectId: 1 } },
    );
    return { modified: result.modifiedCount };
  }
}
