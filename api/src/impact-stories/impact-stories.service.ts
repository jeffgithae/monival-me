import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ImpactStory, ImpactStoryDocument, StoryStatus } from './schemas/impact-story.schema';
import { escapeRegex } from '../common/utils/escape-regex';

export interface CreateImpactStoryDto {
  title: string;
  narrative: string;
  pullQuote?: string;
  projectId?: string;
  subjectName?: string;
  subjectAge?: number;
  subjectSex?: string;
  subjectLocation?: string;
  beneficiaryId?: string;
  coverImageUrl?: string;
  media?: Array<{ url: string; caption?: string; type?: 'image' | 'video' | 'audio' }>;
  consentObtained?: boolean;
  consentDocumentUrl?: string;
  isAnonymised?: boolean;
  tags?: string[];
  thematicArea?: string;
  sdgGoals?: number[];
  isPubliclyVisible?: boolean;
}

export interface ImpactStoryQuery {
  projectId?: string;
  status?: StoryStatus;
  thematicArea?: string;
  tag?: string;
  isPubliclyVisible?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ImpactStoriesService {
  constructor(
    @InjectModel(ImpactStory.name)
    private readonly model: Model<ImpactStoryDocument>,
  ) {}

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    authorUserId: string,
    dto: CreateImpactStoryDto,
  ): Promise<ImpactStoryDocument> {
    if (!dto.consentObtained) {
      throw new BadRequestException(
        'Impact stories require documented subject consent (consentObtained: true).',
      );
    }

    return this.model.create({
      organizationId: new Types.ObjectId(organizationId),
      authorUserId:   new Types.ObjectId(authorUserId),
      projectId:      dto.projectId      ? new Types.ObjectId(dto.projectId)      : undefined,
      beneficiaryId:  dto.beneficiaryId  ? new Types.ObjectId(dto.beneficiaryId)  : undefined,
      title:               dto.title,
      narrative:           dto.narrative,
      pullQuote:           dto.pullQuote,
      subjectName:         dto.isAnonymised ? undefined : dto.subjectName,
      subjectAge:          dto.subjectAge,
      subjectSex:          dto.subjectSex,
      subjectLocation:     dto.subjectLocation,
      coverImageUrl:       dto.coverImageUrl,
      media:               dto.media ?? [],
      consentObtained:     dto.consentObtained,
      consentDocumentUrl:  dto.consentDocumentUrl,
      isAnonymised:        dto.isAnonymised ?? false,
      tags:                dto.tags ?? [],
      thematicArea:        dto.thematicArea,
      sdgGoals:            dto.sdgGoals ?? [],
      isPubliclyVisible:   dto.isPubliclyVisible ?? false,
      status:              'draft',
    });
  }

  async findAll(organizationId: string, query: ImpactStoryQuery = {}) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (query.projectId)        filter.projectId      = new Types.ObjectId(query.projectId);
    if (query.status)           filter.status         = query.status;
    if (query.thematicArea)     filter.thematicArea   = query.thematicArea;
    if (query.tag)              filter.tags           = query.tag;
    if (query.isPubliclyVisible !== undefined) filter.isPubliclyVisible = query.isPubliclyVisible;
    if (query.search) {
      const safeSearch = escapeRegex(query.search);
      filter.$or = [
        { title:     { $regex: safeSearch, $options: 'i' } },
        { narrative: { $regex: safeSearch, $options: 'i' } },
        { tags:      { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async findOne(organizationId: string, id: string): Promise<ImpactStoryDocument> {
    const story = await this.model.findOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!story) throw new NotFoundException('Impact story not found.');
    // Increment view count asynchronously
    this.model.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).exec().catch(() => {});
    return story;
  }

  /** Public endpoint — only returns published, publicly-visible stories */
  async findPublic(organizationId: string, query: Omit<ImpactStoryQuery, 'status' | 'isPubliclyVisible'> = {}) {
    return this.findAll(organizationId, {
      ...query,
      status: 'published',
      isPubliclyVisible: true,
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: Partial<CreateImpactStoryDto>,
  ): Promise<ImpactStoryDocument> {
    const story = await this.model.findOneAndUpdate(
      { _id: id, organizationId: new Types.ObjectId(organizationId) },
      {
        ...dto,
        projectId:     dto.projectId     ? new Types.ObjectId(dto.projectId)     : undefined,
        beneficiaryId: dto.beneficiaryId ? new Types.ObjectId(dto.beneficiaryId) : undefined,
      },
      { new: true },
    );
    if (!story) throw new NotFoundException('Impact story not found.');
    return story;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: StoryStatus,
    publishedByUserId?: string,
  ): Promise<ImpactStoryDocument> {
    const story = await this.model.findOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!story) throw new NotFoundException('Impact story not found.');

    if (status === 'published') {
      if (!story.consentObtained) {
        throw new ForbiddenException('Cannot publish a story without documented consent.');
      }
      story.publishedAt = new Date();
      if (publishedByUserId) {
        story.publishedByUserId = new Types.ObjectId(publishedByUserId);
      }
    }

    story.status = status;
    return story.save();
  }

  async remove(organizationId: string, id: string): Promise<{ deleted: boolean }> {
    const result = await this.model.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Impact story not found.');
    return { deleted: true };
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async stats(organizationId: string) {
    const agg = await this.model.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalViews: { $sum: '$viewCount' },
        },
      },
    ]);

    const result: Record<string, number> = {
      draft: 0, review: 0, published: 0, archived: 0, totalViews: 0,
    };
    for (const row of agg) {
      result[row._id as string] = row.count;
      result.totalViews = (result.totalViews ?? 0) + (row.totalViews ?? 0);
    }
    result.total = (result.draft ?? 0) + (result.review ?? 0) + (result.published ?? 0) + (result.archived ?? 0);
    return result;
  }

  /**
   * Project cascade cleanup. Impact stories retain narrative/marketing
   * value even after the project they describe has ended or been removed
   * — unscope rather than delete.
   */
  async unscopeFromProject(organizationId: string, projectId: string) {
    const result = await this.model.updateMany(
      { organizationId: new Types.ObjectId(organizationId), projectId: new Types.ObjectId(projectId) },
      { $unset: { projectId: 1 } },
    );
    return { modified: result.modifiedCount };
  }
}