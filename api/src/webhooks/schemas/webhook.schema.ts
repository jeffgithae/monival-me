import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebhookDocument = HydratedDocument<Webhook>;

/** All events that can trigger a webhook */
export const WEBHOOK_EVENTS = [
  'activity.submitted',
  'activity.approved',
  'activity.rejected',
  'report.submitted',
  'report.approved',
  'grant.expiring',
  'beneficiary.enrolled',
  'beneficiary.exited',
  'workflow.action_required',
  'workflow.completed',
  'indicator.target_missed',
  'impact_story.published',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

@Schema({ timestamps: true })
export class Webhook {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OrganizationMember', required: true })
  createdByUserId!: Types.ObjectId;

  /** Human label */
  @Prop({ required: true, trim: true })
  name!: string;

  /** The HTTPS URL to POST events to */
  @Prop({ required: true })
  url!: string;

  /** HMAC-SHA256 signing secret — used to generate X-Monival-Signature header */
  @Prop({ required: true, select: false })
  secret!: string;

  /** Which events this subscription receives */
  @Prop({ type: [String], enum: WEBHOOK_EVENTS, required: true })
  events!: WebhookEvent[];

  @Prop({ default: true })
  isActive!: boolean;

  /** Optional project filter — if set, only events for this project are sent */
  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  /** Last delivery result */
  @Prop({ enum: ['pending', 'success', 'failed'], default: 'pending' })
  lastDeliveryStatus?: 'pending' | 'success' | 'failed';

  @Prop()
  lastDeliveredAt?: Date;

  @Prop({ default: 0 })
  failureCount!: number;
}

export const WebhookSchema = SchemaFactory.createForClass(Webhook);
WebhookSchema.index({ organizationId: 1, isActive: 1 });
WebhookSchema.index({ organizationId: 1, events: 1 });