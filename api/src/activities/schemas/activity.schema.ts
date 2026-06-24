import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({ _id: false })
export class DisaggregationEntry {
  @Prop({ required: true }) category!: string;  // e.g. "Sex"
  @Prop({ required: true }) value!: string;      // e.g. "Female"
  @Prop({ type: Number, required: true, min: 0 }) count!: number;
}

@Schema({ _id: false })
export class ActivityAttachment {
  @Prop({ required: true }) filename!: string;
  @Prop({ required: true }) url!: string;
  @Prop() mimeType?: string;
  @Prop({ type: Number }) sizeBytes?: number;
  @Prop({ type: Date, default: () => new Date() }) uploadedAt!: Date;
}

@Schema({ timestamps: true })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator', index: true })
  indicatorId?: Types.ObjectId;

  // ── Core ──────────────────────────────────────────────────────────────────
  @Prop({ required: true, trim: true }) title!: string;
  @Prop({ trim: true })                 description?: string;
  @Prop({ required: true, index: true }) activityDate!: Date;

  @Prop({
    enum: [
      'training', 'distribution', 'meeting', 'survey', 'assessment',
      'construction', 'repair', 'health_service', 'awareness', 'coordination',
      'monitoring', 'community_engagement', 'capacity_building', 'advocacy',
      'research', 'data_collection', 'cash_transfer', 'other',
    ],
  })
  activityType?: string;

  // ── Location ──────────────────────────────────────────────────────────────
  @Prop({ trim: true }) location?: string;
  @Prop({ trim: true }) country?: string;
  @Prop({ trim: true }) region?: string;
  @Prop({ trim: true }) district?: string;
  @Prop({ trim: true }) village?: string;
  @Prop({ trim: true }) site?: string;          // Specific site/facility name

  @Prop({ type: { latitude: Number, longitude: Number }, _id: false })
  geoPoint?: { latitude: number; longitude: number };

  // ── Outputs ───────────────────────────────────────────────────────────────
  @Prop({ default: 0, min: 0 }) participants!: number;
  @Prop({ default: 0 })         quantity!: number;

  // Participant breakdown (standard for most donors)
  @Prop({ type: Number, min: 0, default: 0 }) participantsMale!: number;
  @Prop({ type: Number, min: 0, default: 0 }) participantsFemale!: number;
  @Prop({ type: Number, min: 0, default: 0 }) participantsOther!: number;
  @Prop({ type: Number, min: 0, default: 0 }) participantsUnder18!: number;
  @Prop({ type: Number, min: 0, default: 0 }) participantsOver60!: number;
  @Prop({ type: Number, min: 0, default: 0 }) participantsPwd!: number;      // persons with disabilities
  @Prop({ type: Number, min: 0, default: 0 }) participantsIdp!: number;      // internally displaced
  @Prop({ type: Number, min: 0, default: 0 }) participantsRefugee!: number;

  // ── Disaggregated data ────────────────────────────────────────────────────
  @Prop({ type: [DisaggregationEntry], default: [] })
  disaggregationData!: DisaggregationEntry[];

  // ── Financial ─────────────────────────────────────────────────────────────
  @Prop({ type: Number, min: 0 }) cost?: number;
  @Prop({ trim: true })           costCurrency?: string;
  @Prop({ type: Types.ObjectId, ref: 'Grant' }) grantId?: Types.ObjectId;
  @Prop({ trim: true }) budgetLine?: string;    // Which budget line this activity charges to

  // ── Evidence & quality ────────────────────────────────────────────────────
  @Prop({ trim: true }) evidenceUrl?: string;
  @Prop({ trim: true }) evidenceNotes?: string;
  @Prop({ type: [ActivityAttachment], default: [] }) attachments!: ActivityAttachment[];
  @Prop({ type: Boolean, default: false }) hasPhotoEvidence!: boolean;
  @Prop({ type: Boolean, default: false }) hasSignatureSheet!: boolean;

  // ── Narrative ─────────────────────────────────────────────────────────────
  @Prop({ trim: true }) notes?: string;
  @Prop({ trim: true }) challenges?: string;
  @Prop({ trim: true }) recommendations?: string;
  @Prop({ trim: true }) followUpActions?: string;  // concrete next steps

  // ── Relationships ─────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'Partner' })  partnerId?: Types.ObjectId;
  @Prop({ type: [Types.ObjectId], ref: 'Beneficiary' }) beneficiaryIds?: Types.ObjectId[];
  @Prop({ type: Types.ObjectId, ref: 'ActivityTemplate' }) templateId?: Types.ObjectId;

  // ── Workflow ──────────────────────────────────────────────────────────────
  @Prop({
    type: String, default: 'approved',
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    index: true,
  })
  status!: string;

  @Prop({ trim: true }) rejectionReason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' }) submittedByUserId?: Types.ObjectId;
  @Prop() submittedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reviewedByUserId?: Types.ObjectId;
  @Prop() reviewedAt?: Date;

  // ── Quality flags (computed) ───────────────────────────────────────────────
  @Prop({ type: [String], default: [] }) qualityFlags!: string[];

  // ── PWA / Offline sync ─────────────────────────────────────────────────────
  // clientId is a UUID generated by the mobile PWA before the record is
  // sent to the server. It is used as an idempotency key so that retrying
  // a failed sync does not create duplicate records.
  @Prop({ trim: true, sparse: true }) clientId?: string;
  @Prop({ type: Boolean, default: false }) syncedFromOffline!: boolean;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
ActivitySchema.index({ organizationId: 1, projectId: 1, activityDate: -1 });
ActivitySchema.index({ organizationId: 1, indicatorId: 1 });
ActivitySchema.index({ organizationId: 1, status: 1 });
ActivitySchema.index({ organizationId: 1, projectId: 1, status: 1 });
ActivitySchema.index({ organizationId: 1, activityType: 1 });
ActivitySchema.index({ organizationId: 1, grantId: 1 });
// Partial unique index: only enforce uniqueness when clientId is present.
// This prevents duplicate submissions when the PWA retries a failed sync.
ActivitySchema.index(
  { organizationId: 1, clientId: 1 },
  {
    unique: true,
    name: 'org_clientId_unique',
    partialFilterExpression: { clientId: { $exists: true, $type: 'string', $gt: '' } },
  },
);