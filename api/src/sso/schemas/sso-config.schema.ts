import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { isEncrypted, encryptField } from '../../common/utils/field-encryption';

export type SsoConfigDocument = HydratedDocument<SsoConfig>;

export type SsoProtocol = 'saml' | 'oidc';

@Schema({ timestamps: true })
export class SsoConfig {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, unique: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, enum: ['saml', 'oidc'] })
  protocol!: SsoProtocol;

  @Prop({ default: false })
  isEnabled!: boolean;

  /** Enforce SSO — block password login when true */
  @Prop({ default: false })
  enforced!: boolean;

  // ── SAML fields ─────────────────────────────────────────────────────────────
  /** IdP metadata URL (auto-fetched) or pasted XML */
  @Prop()
  samlMetadataUrl?: string;

  @Prop()
  samlMetadataXml?: string;

  /** IdP Entity ID parsed from metadata */
  @Prop()
  samlEntryPoint?: string;

  @Prop()
  samlIssuer?: string;

  /**
   * PEM-encoded IdP signing certificate. Not secret in the cryptographic
   * sense (it's a public verification cert), but excluded from default
   * queries to keep config payloads small and avoid leaking infra details.
   */
  @Prop({ select: false })
  samlCert?: string;

  // ── OIDC fields ──────────────────────────────────────────────────────────────
  @Prop()
  oidcIssuer?: string;

  @Prop()
  oidcClientId?: string;

  /**
   * OIDC client secret — encrypted at rest (AES-256-GCM, see pre-save hook
   * below) and excluded from default queries. Use `.select('+oidcClientSecret')`
   * and `decryptField()` when the raw value is actually needed (e.g. token
   * exchange with the identity provider).
   */
  @Prop({ select: false })
  oidcClientSecret?: string;

  @Prop()
  oidcDiscoveryUrl?: string;

  // ── Attribute mapping ────────────────────────────────────────────────────────
  @Prop({
    type: Object,
    default: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
    },
  })
  attributeMapping!: {
    email: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  };

  /** Allowed email domains for this SSO config, e.g. ['acme.org'] */
  @Prop({ type: [String], default: [] })
  allowedDomains!: string[];

  /** Default role assigned to new SSO users */
  @Prop({ default: 'viewer' })
  defaultRole!: string;

  @Prop()
  lastTestedAt?: Date;

  @Prop()
  lastTestResult?: 'success' | 'failed';
}

export const SsoConfigSchema = SchemaFactory.createForClass(SsoConfig);
SsoConfigSchema.index({ organizationId: 1 }, { unique: true });

// Encrypt oidcClientSecret at rest, same pattern as org cloud storage credentials.
SsoConfigSchema.pre('save', async function (this: SsoConfigDocument) {
  if (this.isModified('oidcClientSecret') && this.oidcClientSecret && !isEncrypted(this.oidcClientSecret)) {
    this.oidcClientSecret = encryptField(this.oidcClientSecret);
  }
});

function encryptOidcSecretOnUpdate(this: any, next: () => void) {
  const update = this.getUpdate() as Record<string, any>;
  const secret = update?.oidcClientSecret ?? update?.$set?.oidcClientSecret;
  if (secret && !isEncrypted(secret)) {
    const encrypted = encryptField(secret);
    if (update.$set) update.$set.oidcClientSecret = encrypted;
    else update.oidcClientSecret = encrypted;
  }
  next();
}
SsoConfigSchema.pre('findOneAndUpdate', encryptOidcSecretOnUpdate);
SsoConfigSchema.pre('updateOne', encryptOidcSecretOnUpdate);