import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { PlanId } from '../../common/constants/plans';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug!: string;

  @Prop({ trim: true, lowercase: true, unique: true, sparse: true })
  domain?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  sector?: string;

  @Prop({ type: String, default: 'trial' })
  planId!: PlanId;

  @Prop({
    type: String,
    default: 'trialing',
    enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'],
  })
  subscriptionStatus!: string;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  stripeSubscriptionId?: string;

  @Prop()
  trialEndsAt?: Date;

  @Prop()
  currentPeriodEnd?: Date;

  @Prop({
    type: [String],
    enum: ['logframe', 'bsc', 'okr'],
    default: ['logframe'],
  })
  planningFrameworks!: string[];

  @Prop({
    type: String,
    enum: ['logframe', 'bsc', 'okr'],
    default: 'logframe',
  })
  primaryFramework!: string;

  @Prop({
    type: Object,
    default: {},
  })
  strategicOverview?: {
    vision?: string;
    mission?: string;
    strategicPillars?: Array<{
      pillar: string;
      description: string;
      initiatives: string[];
    }>;
  };

  @Prop({
    type: Object,
    default: {
      mfaRequired: false,
      ssoEnabled: false,
      dataResidency: 'default',
      allowedDomains: [],
    },
  })
  enterpriseSettings?: {
    mfaRequired?: boolean;
    ssoEnabled?: boolean;
    ssoProvider?: string;
    ssoMetadataUrl?: string;
    dataResidency?: string;
    allowedDomains?: string[];
  };
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ slug: 1 }, { unique: true, sparse: true });
OrganizationSchema.index({ domain: 1 }, { unique: true, sparse: true });
