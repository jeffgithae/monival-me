import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

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

  /** PEM-encoded IdP signing certificate */
  @Prop()
  samlCert?: string;

  // ── OIDC fields ──────────────────────────────────────────────────────────────
  @Prop()
  oidcIssuer?: string;

  @Prop()
  oidcClientId?: string;

  @Prop()
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