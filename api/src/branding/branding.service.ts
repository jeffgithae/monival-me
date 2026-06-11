import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { BrandingConfig, BrandingConfigDocument } from './schemas/branding-config.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { planHasFeature } from '../common/constants/plans';

export interface UpdateBrandingDto {
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  customDomain?: string;
  reportFooterText?: string;
  hidePoweredBy?: boolean;
  defaultTheme?: 'light' | 'dark' | 'system';
  supportEmail?: string;
  supportUrl?: string;
}

@Injectable()
export class BrandingService {
  constructor(
    @InjectModel(BrandingConfig.name)
    private readonly brandingModel: Model<BrandingConfigDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  // ── Public (no plan check — any plan can read branding for their own domain) ─

  async getBrandingByOrgId(organizationId: string): Promise<BrandingConfigDocument | null> {
    return this.brandingModel
      .findOne({ organizationId: new Types.ObjectId(organizationId) })
      .lean() as any;
  }

  /** Called by the frontend to bootstrap branding on load */
  async getBrandingByDomain(domain: string): Promise<BrandingConfigDocument | null> {
    return this.brandingModel.findOne({ customDomain: domain, customDomainVerified: true }).lean() as any;
  }

  // ── Admin (plan-gated) ─────────────────────────────────────────────────────

  async upsertBranding(
    organizationId: string,
    dto: UpdateBrandingDto,
  ): Promise<BrandingConfigDocument> {
    await this.assertWhiteLabelEnabled(organizationId);

    if (dto.primaryColor && !/^#[0-9a-fA-F]{3,6}$/.test(dto.primaryColor)) {
      throw new BadRequestException('primaryColor must be a valid hex colour, e.g. #1a56db');
    }

    if (dto.customDomain) {
      // Check domain not already claimed by another org
      const existing = await this.brandingModel.findOne({
        customDomain: dto.customDomain,
        organizationId: { $ne: new Types.ObjectId(organizationId) },
      });
      if (existing) throw new BadRequestException('This domain is already registered to another organisation.');
    }

    const update: Partial<BrandingConfig> & UpdateBrandingDto = { ...dto };

    // If a new custom domain is being set, reset verification
    const current = await this.brandingModel.findOne({ organizationId: new Types.ObjectId(organizationId) });
    if (dto.customDomain && dto.customDomain !== current?.customDomain) {
      (update as any).customDomainVerified = false;
      (update as any).domainVerificationToken = `monival-verify=${crypto.randomBytes(16).toString('hex')}`;
    }

    return this.brandingModel.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId) },
      { ...update, organizationId: new Types.ObjectId(organizationId) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ) as any;
  }

  /** Returns the DNS TXT record value needed to verify custom domain */
  async initiateDomainVerification(organizationId: string): Promise<{ token: string; txtRecord: string; domain: string }> {
    await this.assertWhiteLabelEnabled(organizationId);

    const branding = await this.brandingModel.findOne({ organizationId: new Types.ObjectId(organizationId) });
    if (!branding?.customDomain) throw new BadRequestException('Set a custom domain first.');

    const token = branding.domainVerificationToken ?? `monival-verify=${crypto.randomBytes(16).toString('hex')}`;
    await this.brandingModel.updateOne(
      { organizationId: new Types.ObjectId(organizationId) },
      { domainVerificationToken: token },
    );

    return {
      token,
      domain: branding.customDomain,
      txtRecord: `_monival-verify.${branding.customDomain}  TXT  "${token}"`,
    };
  }

  /** Verify domain ownership via DNS TXT lookup (simplified — production would use a real DNS resolver) */
  async verifyDomain(organizationId: string): Promise<{ verified: boolean; message: string }> {
    await this.assertWhiteLabelEnabled(organizationId);

    const branding = await this.brandingModel.findOne({ organizationId: new Types.ObjectId(organizationId) });
    if (!branding?.customDomain) throw new BadRequestException('No custom domain configured.');
    if (!branding.domainVerificationToken) throw new BadRequestException('Start domain verification first.');

    // In production: use dns.resolveTxt(`_monival-verify.${branding.customDomain}`)
    // For now, mark as pending — customer would be told to add the TXT record
    return {
      verified: false,
      message: `Add TXT record: _monival-verify.${branding.customDomain} → "${branding.domainVerificationToken}" — then call this endpoint again.`,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async assertWhiteLabelEnabled(organizationId: string) {
    const org = await this.orgModel.findById(organizationId).select('planId').lean();
    if (!org) throw new NotFoundException('Organisation not found.');
    if (!planHasFeature(org.planId, 'hasWhiteLabel')) {
      throw new ForbiddenException(
        'White-labelling is available on the Organization plan and above. Upgrade to enable it.',
      );
    }
  }
}