import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BudgetLineItemDocument = HydratedDocument<BudgetLineItem>;

@Schema({ timestamps: true })
export class BudgetLineItem {
  @Prop({ type: Types.ObjectId, required: true, ref: 'BudgetAllocation' })
  budgetAllocationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, type: Number, min: 0 })
  amount!: number;

  @Prop({ default: 0, type: Number, min: 0 })
  spent!: number;

  @Prop({ trim: true })
  category?: string;

  @Prop({ default: 'planned', enum: ['planned', 'committed', 'spent', 'cancelled'] })
  status!: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Activity' })
  linkedActivity?: Types.ObjectId;
}

export const BudgetLineItemSchema = SchemaFactory.createForClass(BudgetLineItem);

BudgetLineItemSchema.index({ budgetAllocationId: 1 });
BudgetLineItemSchema.index({ organizationId: 1 });
