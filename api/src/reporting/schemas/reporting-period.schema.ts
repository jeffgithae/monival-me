import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReportingPeriodDocument = HydratedDocument<ReportingPeriod>;

@Schema({ timestamps: true })
export class ReportingPeriod {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: ['monthly', 'quarterly', 'semiannual', 'annual', 'custom'], default: 'quarterly' })
  cadence!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({
    type: String,
    enum: ['open', 'submitted', 'approved', 'locked'],
    default: 'open',
    index: true,
  })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  submittedByUserId?: Types.ObjectId;

  @Prop()
  submittedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedByUserId?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop({ trim: true })
  notes?: string;
}

export const ReportingPeriodSchema = SchemaFactory.createForClass(ReportingPeriod);
ReportingPeriodSchema.index({ organizationId: 1, projectId: 1, startDate: 1, endDate: 1 });
