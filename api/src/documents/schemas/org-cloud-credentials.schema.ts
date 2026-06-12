import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { CloudProvider } from './cloud-storage-connection.schema';

export type OrgCloudCredentialsDocument = HydratedDocument<OrgCloudCredentials>;

/**
 * Stores per-organisation OAuth app credentials for each cloud provider.
 * Each org registers their own OAuth apps with Google/Dropbox/Microsoft,
 * then saves the client ID + secret here. The service reads from this
 * collection first; env-var fallback is only used if no row exists (for
 * self-hosted / single-tenant deployments).
 *
 * Secrets are stored as plain strings — in production, encrypt at rest
 * using MongoDB field-level encryption or a KMS (e.g. AWS KMS, HashiCorp Vault).
 */
@Schema({ timestamps: true, collection: 'org_cloud_credentials' })
export class OrgCloudCredentials {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['google_drive', 'dropbox', 'sharepoint'],
  })
  provider!: CloudProvider;

  /** OAuth Client ID (public) */
  @Prop({ required: true })
  clientId!: string;

  /**
   * OAuth Client Secret — treat as sensitive.
   * Never return this in API responses (select: false).
   */
  @Prop({ required: true, select: false })
  clientSecret!: string;

  /**
   * SharePoint / Azure AD only: Directory (tenant) ID.
   * For Google Drive and Dropbox this is not needed.
   */
  @Prop()
  tenantId?: string;

  /** Human-readable label, e.g. "My Org Google Workspace" */
  @Prop()
  label?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastModifiedBy?: Types.ObjectId;
}

export const OrgCloudCredentialsSchema = SchemaFactory.createForClass(OrgCloudCredentials);

// One active credential set per org per provider
OrgCloudCredentialsSchema.index({ organizationId: 1, provider: 1 }, { unique: false });