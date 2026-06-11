import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityTemplateDocument = HydratedDocument<ActivityTemplate>;

@Schema({ timestamps: true })
export class ActivityTemplate {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Indicator' })
  indicatorId?: Types.ObjectId;

  @Prop({ trim: true })
  defaultLocation?: string;

  @Prop({ trim: true })
  defaultActivityType?: string;

  @Prop({ trim: true })
  defaultEvidenceUrl?: string;

  @Prop({ default: 0 })
  defaultParticipants!: number;

  @Prop({ default: 0 })
  defaultQuantity!: number;

  @Prop({ trim: true })
  defaultNotes?: string;
}

export const ActivityTemplateSchema = SchemaFactory.createForClass(ActivityTemplate);

// ─── Indexes ──────────────────────────────────────────────────────────────────
ActivityTemplateSchema.index({ organizationId: 1 });
ActivityTemplateSchema.index({ organizationId: 1, projectId: 1 });