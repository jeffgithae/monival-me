import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OKRDocument = HydratedDocument<OKR>;

@Schema({ timestamps: true })
export class OKR {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, type: Number, min: 1, max: 4 })
  quarter!: number;

  @Prop({ required: true })
  year!: number;

  @Prop({ type: String, enum: ['draft', 'active', 'completed', 'archived'], default: 'draft' })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerUserId?: Types.ObjectId;

  @Prop({
    type: [
      {
        _id: { type: Types.ObjectId, auto: true },
        title: String,
        description: String,
        targetValue: Number,
        currentValue: { type: Number, default: 0 },
        unit: String,
        confidence: { type: Number, min: 0, max: 100, default: 50 },
        status: { type: String, enum: ['not_started', 'in_progress', 'at_risk', 'completed'], default: 'not_started' },
        notes: String,
      },
    ],
    default: [],
  })
  keyResults!: Array<{
    _id?: Types.ObjectId;
    title: string;
    description?: string;
    targetValue: number;
    currentValue: number;
    unit?: string;
    confidence: number;
    status: string;
    notes?: string;
  }>;

  @Prop({ type: [Types.ObjectId], ref: 'Project', default: [] })
  linkedProjects?: Types.ObjectId[];

  @Prop({ default: 0, type: Number, min: 0, max: 100 })
  progressPercentage!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewDate?: Date;
}

export const OKRSchema = SchemaFactory.createForClass(OKR);

OKRSchema.index({ organizationId: 1 });
OKRSchema.index({ year: 1, quarter: 1 });
OKRSchema.index({ status: 1 });
OKRSchema.index({ ownerUserId: 1 });
