import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IndicatorTargetDocument = HydratedDocument<IndicatorTarget>;

@Schema({ timestamps: true })
export class IndicatorTarget {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ReportingPeriod', required: true, index: true })
  reportingPeriodId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator', required: true, index: true })
  indicatorId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  baseline!: number;

  @Prop({ type: Number, required: true })
  target!: number;

  @Prop({ trim: true })
  notes?: string;
}

export const IndicatorTargetSchema = SchemaFactory.createForClass(IndicatorTarget);
IndicatorTargetSchema.index(
  { organizationId: 1, reportingPeriodId: 1, indicatorId: 1 },
  { unique: true },
);
