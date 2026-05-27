import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GrantDocument = HydratedDocument<Grant>;

@Schema({ timestamps: true })
export class Grant {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Donor' })
  donorId?: Types.ObjectId;

  @Prop({ required: true, type: Number, min: 0 })
  amount!: number;

  @Prop({ default: 'USD', trim: true })
  currency!: string;

  @Prop({ default: 0, type: Number, min: 0 })
  amountSpent!: number;

  @Prop({
    type: String,
    enum: ['pending', 'active', 'completed', 'closed'],
    default: 'active',
  })
  status!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ type: [Types.ObjectId], ref: 'Project', default: [] })
  linkedProjects!: Types.ObjectId[];

  @Prop({ default: true })
  requiresMonthlyReporting!: boolean;

  @Prop({ default: true })
  requiresFinalReport!: boolean;

  @Prop({ trim: true })
  termsAndConditions?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const GrantSchema = SchemaFactory.createForClass(Grant);

// Index for common queries
GrantSchema.index({ organizationId: 1 });
GrantSchema.index({ donorId: 1 });
GrantSchema.index({ status: 1 });
GrantSchema.index({ organizationId: 1, status: 1 });
