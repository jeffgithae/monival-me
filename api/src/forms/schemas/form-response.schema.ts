import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FormResponseDocument = HydratedDocument<FormResponse>;

@Schema({ timestamps: true })
export class FormResponse {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FormTemplate', required: true, index: true })
  templateId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator', index: true })
  indicatorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Activity', index: true })
  activityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  submittedByUserId?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  collectedAt!: Date;

  @Prop({ type: Object, default: {} })
  answers!: Record<string, unknown>;

  @Prop({ type: String, enum: ['draft', 'submitted'], default: 'submitted' })
  status!: string;
}

export const FormResponseSchema = SchemaFactory.createForClass(FormResponse);

// ─── Indexes ──────────────────────────────────────────────────────────────────
FormResponseSchema.index({ organizationId: 1, templateId: 1, createdAt: -1 });
FormResponseSchema.index({ organizationId: 1, projectId: 1 });
FormResponseSchema.index({ 'answers.__integrationId': 1, 'answers.__externalId': 1 });