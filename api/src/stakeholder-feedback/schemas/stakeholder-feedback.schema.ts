import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StakeholderFeedbackDocument = HydratedDocument<StakeholderFeedback>;

export enum FeedbackChannel {
  SURVEY    = 'survey',
  INTERVIEW = 'interview',
  FGD       = 'focus_group_discussion',
  COMPLAINT = 'complaint',
  SUGGESTION= 'suggestion',
  SMS       = 'sms',
  SOCIAL    = 'social_media',
  OTHER     = 'other',
}

export enum FeedbackSentiment {
  VERY_POSITIVE = 'very_positive',
  POSITIVE      = 'positive',
  NEUTRAL       = 'neutral',
  NEGATIVE      = 'negative',
  VERY_NEGATIVE = 'very_negative',
}

export enum FeedbackStatus {
  RECEIVED   = 'received',
  REVIEWED   = 'reviewed',
  ACTIONED   = 'actioned',
  CLOSED     = 'closed',
}

@Schema({ _id: false })
export class FeedbackMedia {
  @Prop({ required: true }) url!: string;
  @Prop({ enum: ['image', 'video', 'audio', 'document'], default: 'document' }) type!: string;
  @Prop() caption?: string;
}

@Schema({ _id: false })
export class ActionTaken {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) takenAt!: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) byUserId?: Types.ObjectId;
  @Prop() notes?: string;
}

@Schema({ timestamps: true })
export class StakeholderFeedback {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', index: true })
  projectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator' })
  indicatorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Activity' })
  activityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Beneficiary' })
  beneficiaryId?: Types.ObjectId;

  // ── Submitter (may be anonymous) ──────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User' })
  collectedByUserId?: Types.ObjectId;

  @Prop({ trim: true }) respondentName?: string;
  @Prop({ trim: true }) respondentContact?: string;
  @Prop({ enum: ['male', 'female', 'other', 'prefer_not_to_say'] }) respondentSex?: string;
  @Prop({ type: Number }) respondentAge?: number;
  @Prop({ trim: true }) respondentLocation?: string;
  @Prop({ type: Boolean, default: false }) isAnonymous!: boolean;

  // ── Content ───────────────────────────────────────────────────────────────
  @Prop({ required: true, trim: true }) title!: string;
  @Prop({ required: true, trim: true }) content!: string;

  @Prop({ enum: Object.values(FeedbackChannel), default: FeedbackChannel.SURVEY })
  channel!: string;

  @Prop({ enum: Object.values(FeedbackSentiment) })
  sentiment?: string;

  // AI-derived sentiment score 0-100 (0=very negative, 100=very positive)
  @Prop({ type: Number, min: 0, max: 100 })
  sentimentScore?: number;

  @Prop({ type: [String], default: [] }) thematicTags!: string[];

  // ── Quality evidence (photos, recordings, transcripts) ────────────────────
  @Prop({ type: [FeedbackMedia], default: [] }) media!: FeedbackMedia[];

  // ── Status & response tracking ────────────────────────────────────────────
  @Prop({ enum: Object.values(FeedbackStatus), default: FeedbackStatus.RECEIVED, index: true })
  status!: string;

  @Prop({ type: [ActionTaken], default: [] }) actionsLog!: ActionTaken[];

  @Prop({ trim: true }) responseNotes?: string;

  // ── Data protection ───────────────────────────────────────────────────────
  @Prop({ type: Boolean, default: false }) consentToPublish!: boolean;
  @Prop() collectedAt?: Date;

  // ── AI summary (auto-populated by copilot) ────────────────────────────────
  @Prop({ trim: true }) aiSummary?: string;
  @Prop({ type: Number }) aiConfidence?: number; // 0-1
}

export const StakeholderFeedbackSchema = SchemaFactory.createForClass(StakeholderFeedback);
StakeholderFeedbackSchema.index({ organizationId: 1, projectId: 1 });
StakeholderFeedbackSchema.index({ organizationId: 1, status: 1 });
StakeholderFeedbackSchema.index({ organizationId: 1, channel: 1 });
StakeholderFeedbackSchema.index({ organizationId: 1, sentiment: 1 });
StakeholderFeedbackSchema.index({ organizationId: 1, createdAt: -1 });
