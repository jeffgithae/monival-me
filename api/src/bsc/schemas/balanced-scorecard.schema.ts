import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type BalancedScorecardDocument = HydratedDocument<BalancedScorecard>;

@Schema({ timestamps: true })
export class BalancedScorecard {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  fiscalYear!: number;

  @Prop({ type: String, enum: ['draft', 'active', 'archived'], default: 'draft' })
  status!: string;

  @Prop({
    type: [
      {
        perspective: {
          type: String,
          enum: ['financial', 'customer', 'internal', 'learning'],
          required: true,
        },
        strategicTheme: String,
        objectives: [
          {
            _id: { type: SchemaTypes.ObjectId, auto: true },
            title: String,
            description: String,
            weight: Number,
            target: Number,
            current: { type: Number, default: 0 },
            status: { type: String, enum: ['on_track', 'at_risk', 'off_track'], default: 'on_track' },
          },
        ],
      },
    ],
    default: [],
  })
  perspectives!: Array<{
    perspective: string;
    strategicTheme?: string;
    objectives: Array<{
      _id?: Types.ObjectId;
      title: string;
      description?: string;
      weight: number;
      target: number;
      current: number;
      status: string;
    }>;
  }>;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  lastReviewedBy?: Types.ObjectId;

  @Prop()
  lastReviewDate?: Date;
}

export const BalancedScorecardSchema = SchemaFactory.createForClass(BalancedScorecard);

BalancedScorecardSchema.index({ organizationId: 1 });
BalancedScorecardSchema.index({ fiscalYear: 1 });
BalancedScorecardSchema.index({ status: 1 });
