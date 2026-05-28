import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({ timestamps: true })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator' })
  indicatorId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  activityDate!: Date;

  @Prop({ trim: true })
  location?: string;

  @Prop({ default: 0 })
  participants!: number;

  @Prop({ default: 0 })
  quantity!: number;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  activityType?: string;

  @Prop({ trim: true })
  evidenceUrl?: string;

  @Prop({ trim: true })
  evidenceNotes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Partner' })
  partnerId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Beneficiary' })
  beneficiaryIds?: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'ActivityTemplate' })
  templateId?: Types.ObjectId;

  @Prop({
    type: String,
    default: 'approved',
    enum: ['draft', 'submitted', 'approved', 'rejected'],
  })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  submittedByUserId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedByUserId?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
