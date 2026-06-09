import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ExternalIntegrationDocument = HydratedDocument<ExternalIntegration>;

export type IntegrationPlatform = 'kobo' | 'odk' | 'commcare' | 'ona' | 'webhook' | 'csv';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'disabled';

@Schema({ timestamps: true })
export class ExternalIntegration {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', index: true })
  projectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FormTemplate', index: true })
  templateId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ['kobo', 'odk', 'commcare', 'ona', 'webhook', 'csv'],
    required: true,
  })
  platform!: IntegrationPlatform;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  // Platform credentials / config (encrypted in production)
  @Prop({ type: Object, default: {} })
  config!: Record<string, unknown>;
  // KoboToolbox: { serverUrl, apiToken, assetUid }
  // ODK Central: { serverUrl, projectId, formId, email, password }
  // CommCare: { projectSpace, apiKey, formId }
  // Ona: { serverUrl, apiToken, formId }
  // Webhook: { url, secret, headers }

  // Field mapping: externalFieldName -> local template question key
  @Prop({ type: Object, default: {} })
  fieldMapping!: Record<string, string>;

  // Which local fields to map auto-values into on sync
  @Prop({ type: String })
  indicatorId?: string;

  @Prop({ type: String })
  activityId?: string;

  // Sync tracking
  @Prop({ type: String, enum: ['idle', 'syncing', 'success', 'error', 'disabled'], default: 'idle' })
  syncStatus!: SyncStatus;

  @Prop({ type: Date })
  lastSyncAt?: Date;

  @Prop({ type: String })
  lastSyncError?: string;

  @Prop({ type: Number, default: 0 })
  totalSynced!: number;

  @Prop({ type: Number, default: 0 })
  lastBatchCount!: number;

  // Auto-sync schedule (cron expression or interval minutes)
  @Prop({ type: Number })
  syncIntervalMinutes?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const ExternalIntegrationSchema = SchemaFactory.createForClass(ExternalIntegration);
ExternalIntegrationSchema.index({ organizationId: 1, platform: 1 });