import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BudgetAllocationDocument = HydratedDocument<BudgetAllocation>;

@Schema({ timestamps: true })
export class BudgetAllocation {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ required: true, type: Number, min: 0 })
  allocatedAmount!: number;

  @Prop({ default: 0, type: Number, min: 0 })
  spentAmount!: number;

  @Prop({ default: 'USD', trim: true })
  currency!: string;

  @Prop({
    type: String,
    enum: ['operational', 'project', 'emergency', 'strategic'],
    default: 'operational',
  })
  category!: string;

  @Prop({ type: String, enum: ['draft', 'approved', 'active', 'closed'], default: 'draft' })
  status!: string;

  @Prop({ required: true })
  fiscalYear!: number;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ default: 0, type: Number, min: 0 })
  uncommittedAmount?: number;

  @Prop({ type: [String], default: [] })
  allowedExpenseTypes?: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvalDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const BudgetAllocationSchema = SchemaFactory.createForClass(BudgetAllocation);

// Indexes
BudgetAllocationSchema.index({ organizationId: 1 });
BudgetAllocationSchema.index({ projectId: 1 });
BudgetAllocationSchema.index({ fiscalYear: 1 });
BudgetAllocationSchema.index({ status: 1 });
BudgetAllocationSchema.index({ organizationId: 1, fiscalYear: 1 });
