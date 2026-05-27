import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IndicatorDocument = HydratedDocument<Indicator>;

@Schema({ timestamps: true })
export class Indicator {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Indicator' })
  parentId?: Types.ObjectId;

  @Prop({
    type: String,
    default: 'output',
    enum: ['goal', 'outcome', 'output', 'activity'],
  })
  level!: string;

  @Prop({ required: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  meansOfVerification?: string;

  @Prop({ trim: true })
  assumptions?: string;

  @Prop({ type: [String], default: [] })
  disaggregation!: string[];

  @Prop({ trim: true })
  unit?: string;

  @Prop({ default: 0 })
  baseline!: number;

  @Prop({ required: true })
  target!: number;

  @Prop({ default: 'quarterly', enum: ['monthly', 'quarterly', 'annual'] })
  frequency!: string;
}

export const IndicatorSchema = SchemaFactory.createForClass(Indicator);
