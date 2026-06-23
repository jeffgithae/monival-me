import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ImpactStoryDocument = HydratedDocument<ImpactStory>;

export type StoryStatus = 'draft' | 'review' | 'published' | 'archived';

@Schema({ timestamps: true })
export class ImpactStory {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Activity' })
  activityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator' })
  indicatorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OrganizationMember', required: true })
  authorUserId!: Types.ObjectId;

  // ── Content ────────────────────────────────────────────────────────────────

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true })
  narrative!: string;

  /** Short pull-quote for cards / summaries */
  @Prop({ trim: true })
  pullQuote?: string;

  /** Optional subject / protagonist of the story */
  @Prop({ trim: true })
  subjectName?: string;

  /** Subject's age at time of story */
  @Prop()
  subjectAge?: number;

  @Prop({ enum: ['male', 'female', 'other', 'undisclosed'], default: 'undisclosed' })
  subjectSex?: string;

  /** Subject's location */
  @Prop({ trim: true })
  subjectLocation?: string;

  /** Link to beneficiary record if consent given */
  @Prop({ type: Types.ObjectId, ref: 'Beneficiary' })
  beneficiaryId?: Types.ObjectId;

  // ── Media ──────────────────────────────────────────────────────────────────

  /** Hero image URL */
  @Prop()
  coverImageUrl?: string;

  @Prop({ type: [{ url: String, caption: String, type: { type: String, enum: ['image', 'video', 'audio'], default: 'image' } }], default: [] })
  media!: Array<{ url: string; caption?: string; type: 'image' | 'video' | 'audio' }>;

  // ── Consent & ethics ───────────────────────────────────────────────────────

  /** Whether the subject has given written consent */
  @Prop({ default: false })
  consentObtained!: boolean;

  @Prop()
  consentDocumentUrl?: string;

  /** Anonymised — name/photo excluded even if subject identified */
  @Prop({ default: false })
  isAnonymised!: boolean;

  // ── Classification ─────────────────────────────────────────────────────────

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ trim: true })
  thematicArea?: string;

  /** SDG goals this story relates to */
  @Prop({ type: [Number], default: [] })
  sdgGoals!: number[];

  // ── Publication ────────────────────────────────────────────────────────────

  @Prop({ required: true, enum: ['draft', 'review', 'published', 'archived'], default: 'draft', index: true })
  status!: StoryStatus;

  @Prop()
  publishedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'OrganizationMember' })
  publishedByUserId?: Types.ObjectId;

  @Prop({ default: 0 })
  viewCount!: number;

  /** Whether the story is visible on the public portal / embeds */
  @Prop({ default: false })
  isPubliclyVisible!: boolean;
}

export const ImpactStorySchema = SchemaFactory.createForClass(ImpactStory);
ImpactStorySchema.index({ organizationId: 1, status: 1 });
ImpactStorySchema.index({ organizationId: 1, projectId: 1 });
ImpactStorySchema.index({ organizationId: 1, tags: 1 });
ImpactStorySchema.index({ isPubliclyVisible: 1, status: 1 });