import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BudgetVarianceDocument = HydratedDocument<BudgetVariance>;

@Schema({ timestamps: true })
export class BudgetVariance {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'BudgetAllocation' })
  budgetAllocationId!: Types.ObjectId;

  @Prop({ required: true })
  period!: string; // YYYY-MM format

  @Prop({ required: true, type: Number })
  budgetedAmount!: number;

  @Prop({ required: true, type: Number })
  actualAmount!: number;

  @Prop({ required: true, type: Number })
  variance!: number; // budgetedAmount - actualAmount

  @Prop({ required: true, type: Number })
  variancePercentage!: number; // (variance / budgetedAmount) * 100

  @Prop({
    type: String,
    enum: ['favorable', 'unfavorable'],
  })
  trend!: string;

  @Prop()
  notes?: string;
}

export const BudgetVarianceSchema = SchemaFactory.createForClass(BudgetVariance);

BudgetVarianceSchema.index({ organizationId: 1 });
BudgetVarianceSchema.index({ budgetAllocationId: 1 });
BudgetVarianceSchema.index({ period: 1 });
