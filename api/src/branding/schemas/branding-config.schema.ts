import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BrandingConfigDocument = HydratedDocument<BrandingConfig>;

@Schema({ timestamps: true })
export class BrandingConfig {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, unique: true })
  organizationId!: Types.ObjectId;

  /** Display name shown in nav, emails, and reports — defaults to org name */
  @Prop()
  appName?: string;

  /** URL to logo (square, min 64px) */
  @Prop()
  logoUrl?: string;

  /** URL to favicon (32x32 .ico or .png) */
  @Prop()
  faviconUrl?: string;

  /** Primary brand colour (hex) e.g. "#1a56db" */
  @Prop()
  primaryColor?: string;

  /** Accent / secondary colour */
  @Prop()
  accentColor?: string;

  /** Custom domain the web app is served from, e.g. "m&e.acme.org" */
  @Prop()
  customDomain?: string;

  /** Whether custom domain is verified (DNS TXT record check) */
  @Prop({ default: false })
  customDomainVerified!: boolean;

  /** One-time verification token for DNS TXT record */
  @Prop()
  domainVerificationToken?: string;

  /** Footer text in exported reports */
  @Prop()
  reportFooterText?: string;

  /** "Powered by Evidara " badge hidden when true */
  @Prop({ default: false })
  hidePoweredBy!: boolean;

  /** Colour theme override: 'light' | 'dark' | 'system' */
  @Prop({ default: 'system', enum: ['light', 'dark', 'system'] })
  defaultTheme!: string;

  /** Support email shown in the UI instead of Evidara 's */
  @Prop()
  supportEmail?: string;

  /** Support URL for "Get Help" link */
  @Prop()
  supportUrl?: string;
}

export const BrandingConfigSchema = SchemaFactory.createForClass(BrandingConfig);
BrandingConfigSchema.index({ organizationId: 1 }, { unique: true });
BrandingConfigSchema.index({ customDomain: 1 }, { sparse: true });