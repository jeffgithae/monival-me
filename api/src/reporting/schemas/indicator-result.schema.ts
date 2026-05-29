import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type IndicatorResultDocument = HydratedDocument<IndicatorResult>;

@Schema({ timestamps: true })
export class IndicatorResult {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ReportingPeriod', required: true, index: true })
  reportingPeriodId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator', required: true, index: true })
  indicatorId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  achieved!: number;

  @Prop({ type: Number, default: 0 })
  activityCount!: number;

  @Prop({ type: [Types.ObjectId], ref: 'Activity', default: [] })
  sourceActivityIds!: Types.ObjectId[];

  @Prop({ type: Object, default: {} })
  disaggregations!: Record<string, unknown>;

  @Prop({ trim: true })
  narrative?: string;

  @Prop({
    type: String,
    enum: ['draft', 'submitted', 'approved', 'locked'],
    default: 'draft',
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

  @Prop({ type: SchemaTypes.Mixed })
  qualityFlags?: unknown;
}

export const IndicatorResultSchema = SchemaFactory.createForClass(IndicatorResult);
IndicatorResultSchema.index(
  { organizationId: 1, reportingPeriodId: 1, indicatorId: 1 },
  { unique: true },
);
