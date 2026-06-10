import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

export type CloudProvider = 'google_drive' | 'dropbox' | 'sharepoint';

@Schema({ timestamps: true })
export class CloudStorageConnection {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Organization' })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OrganizationMember', required: true })
  connectedByUserId: Types.ObjectId;

  /** google_drive | dropbox | sharepoint */
  @Prop({ required: true, enum: ['google_drive', 'dropbox', 'sharepoint'] })
  provider: CloudProvider;

  /** Human-readable label set by the user */
  @Prop({ required: true })
  label: string;

  /** OAuth access token (short-lived) */
  @Prop({ required: true })
  accessToken: string;

  /** OAuth refresh token (long-lived) – may be absent for some providers */
  @Prop()
  refreshToken?: string;

  /** Unix timestamp (ms) when accessToken expires */
  @Prop()
  expiresAt?: number;

  /** Provider-specific account info (email, account_id, site_url, etc.) */
  @Prop({ type: Object, default: {} })
  accountMeta: Record<string, unknown>;

  @Prop({ default: true })
  isActive: boolean;
}

export type CloudStorageConnectionDocument = CloudStorageConnection & MongooseDocument;
export const CloudStorageConnectionSchema = SchemaFactory.createForClass(CloudStorageConnection);

// One connection per org+provider is enforced at service level (not unique index,
// because orgs may legitimately have multiple accounts per provider).
CloudStorageConnectionSchema.index({ organizationId: 1, provider: 1 });