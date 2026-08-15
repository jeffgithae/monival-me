import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type AiUsageDocument = HydratedDocument<AiUsage>;

/**
 * One rolling counter per organisation per calendar month.
 *
 * Every Copilot completion is accounted here before and after the provider
 * call, so the per-org monthly budget in the plan definition can be enforced
 * and the feature can be priced.
 */
@Schema({ timestamps: true, collection: 'ai_usage' })
export class AiUsage {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  organizationId!: Types.ObjectId;

  /** Billing period key, `YYYY-MM` in UTC. */
  @Prop({ required: true })
  period!: string;

  @Prop({ default: 0 })
  inputTokens!: number;

  @Prop({ default: 0 })
  outputTokens!: number;

  /** Number of completions served in the period. */
  @Prop({ default: 0 })
  requests!: number;

  /** Per-route breakdown, e.g. `{ 'copilot.message': 42 }`. */
  @Prop({ type: SchemaTypes.Map, of: Number, default: {} })
  requestsByFeature!: Map<string, number>;
}

export const AiUsageSchema = SchemaFactory.createForClass(AiUsage);

// One counter document per org per period; also the lookup index.
AiUsageSchema.index({ organizationId: 1, period: 1 }, { unique: true });
