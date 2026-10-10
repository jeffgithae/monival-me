import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ExchangeRateDocument = HydratedDocument<ExchangeRate>;

/**
 * A cached FX rate. Rates are stored per base currency as a full quote map so
 * one upstream call refreshes every pair we need, and the cache is the
 * authority at read time — the provider is never on the request path.
 */
@Schema({ timestamps: true })
export class ExchangeRate {
  @Prop({ required: true, uppercase: true, trim: true })
  baseCurrency!: string;

  /**
   * Null for market rates, which every organisation shares. Set on an
   * organisation's own overrides, which apply to that organisation alone —
   * one tenant's accounting rate must never reprice another's portfolio.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null })
  organizationId?: Types.ObjectId | null;

  /** { "KES": 129.4, "EUR": 0.92, … } — units of quote per 1 base. */
  @Prop({ type: Object, required: true })
  rates!: Record<string, number>;

  @Prop({ required: true })
  fetchedAt!: Date;

  /** `provider` for an upstream fetch, `manual` for an operator override. */
  @Prop({ type: String, enum: ['provider', 'manual'], default: 'provider' })
  source!: string;

  @Prop({ trim: true })
  providerName?: string;
}

export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);

ExchangeRateSchema.index({ baseCurrency: 1, organizationId: 1 }, { unique: true });
