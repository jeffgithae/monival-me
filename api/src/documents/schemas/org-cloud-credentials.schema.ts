import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { CloudProvider } from './cloud-storage-connection.schema';
import { isEncrypted, encryptField } from '../../common/utils/field-encryption';

export type OrgCloudCredentialsDocument = HydratedDocument<OrgCloudCredentials>;

/**
 * Stores per-organisation OAuth app credentials for each cloud provider.
 * Each org registers their own OAuth apps with Google/Dropbox/Microsoft,
 * then saves the client ID + secret here. The service reads from this
 * collection first; env-var fallback is only used if no row exists (for
 * self-hosted / single-tenant deployments).
 *
 * `clientSecret` is encrypted at rest with AES-256-GCM (see pre-save hook
 * below and `common/utils/field-encryption.ts`) — a database compromise
 * alone does not expose plaintext OAuth secrets. Decrypt with
 * `decryptField()` when reading the value back out for use.
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
   * OAuth Client Secret — encrypted at rest (AES-256-GCM).
   * Never returned in API responses (select: false). Always pass through
   * `decryptField()` after reading with `.select('+clientSecret')`.
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

// Encrypt clientSecret at rest. Runs on every save where clientSecret was
// modified (initial create or rotation) — never stores plaintext.
OrgCloudCredentialsSchema.pre('save', async function (this: OrgCloudCredentialsDocument) {
  if (this.isModified('clientSecret') && this.clientSecret && !isEncrypted(this.clientSecret)) {
    this.clientSecret = encryptField(this.clientSecret);
  }
});

// Also cover findOneAndUpdate / updateOne paths (used by some upsert flows)
function encryptClientSecretOnUpdate(this: any, next: () => void) {
  const update = this.getUpdate() as Record<string, any>;
  const secret = update?.clientSecret ?? update?.$set?.clientSecret;
  if (secret && !isEncrypted(secret)) {
    const encrypted = encryptField(secret);
    if (update.$set) update.$set.clientSecret = encrypted;
    else update.clientSecret = encrypted;
  }
  next();
}
OrgCloudCredentialsSchema.pre('findOneAndUpdate', encryptClientSecretOnUpdate);
OrgCloudCredentialsSchema.pre('updateOne', encryptClientSecretOnUpdate);