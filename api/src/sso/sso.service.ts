import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import { SsoConfig, SsoConfigDocument } from './schemas/sso-config.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { User } from '../users/schemas/user.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { planHasFeature } from '../common/constants/plans';
import { OrgRole } from '../common/constants/roles';

export interface UpsertSsoConfigDto {
  protocol: 'saml' | 'oidc';
  isEnabled?: boolean;
  enforced?: boolean;
  // SAML
  samlMetadataUrl?: string;
  samlMetadataXml?: string;
  samlEntryPoint?: string;
  samlIssuer?: string;
  samlCert?: string;
  // OIDC
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcDiscoveryUrl?: string;
  // Shared
  attributeMapping?: { email: string; firstName?: string; lastName?: string; role?: string };
  allowedDomains?: string[];
  defaultRole?: string;
  enforceForDomains?: string[];
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    @InjectModel(SsoConfig.name)
    private readonly ssoModel: Model<SsoConfigDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Config Management ──────────────────────────────────────────────────────

  async getConfig(organizationId: string): Promise<SsoConfigDocument | null> {
    await this.assertSsoEnabled(organizationId);
    return this.ssoModel
      .findOne({ organizationId: new Types.ObjectId(organizationId) })
      .select('-samlCert -oidcClientSecret') // never leak secrets
      .lean() as any;
  }

  async upsertConfig(
    organizationId: string,
    dto: UpsertSsoConfigDto,
  ): Promise<SsoConfigDocument> {
    await this.assertSsoEnabled(organizationId);

    // If metadata URL provided, fetch and parse it
    if (dto.samlMetadataUrl && !dto.samlMetadataXml) {
      try {
        const resp = await axios.get<string>(dto.samlMetadataUrl, { timeout: 8000 });
        dto.samlMetadataXml = resp.data;
        // Extract entry point and cert from XML (basic parsing)
        const entryPointMatch = dto.samlMetadataXml.match(/Location="([^"]+)"/);
        const certMatch = dto.samlMetadataXml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);
        if (entryPointMatch) dto.samlEntryPoint = entryPointMatch[1];
        if (certMatch) dto.samlCert = certMatch[1].replace(/\s/g, '');
      } catch (err) {
        throw new BadRequestException(
          `Could not fetch SAML metadata from the provided URL. Verify the URL is accessible.`,
        );
      }
    }

    // If OIDC discovery URL provided, fetch well-known config
    if (dto.oidcDiscoveryUrl && !dto.oidcIssuer) {
      try {
        const resp = await axios.get<{ issuer: string }>(dto.oidcDiscoveryUrl, { timeout: 8000 });
        dto.oidcIssuer = resp.data.issuer;
      } catch {
        throw new BadRequestException('Could not fetch OIDC discovery document from the provided URL.');
      }
    }

    const sso = await this.ssoModel.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId) },
      { ...dto, organizationId: new Types.ObjectId(organizationId) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Mirror key flags to org.enterpriseSettings for quick access
    await this.orgModel.findByIdAndUpdate(organizationId, {
      'enterpriseSettings.ssoEnabled': dto.isEnabled ?? false,
      'enterpriseSettings.ssoProvider': dto.protocol,
      'enterpriseSettings.ssoMetadataUrl': dto.samlMetadataUrl,
    });

    return sso;
  }

  async toggleEnforcement(organizationId: string, enforce: boolean) {
    await this.assertSsoEnabled(organizationId);
    const sso = await this.ssoModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!sso?.isEnabled) {
      throw new BadRequestException('SSO must be enabled and tested before enforcement.');
    }
    return this.ssoModel.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId) },
      { enforced: enforce },
      { new: true },
    );
  }

  // ── SP Metadata (for SAML) ────────────────────────────────────────────────

  getSpMetadata(organizationId: string): string {
    const baseUrl = this.config.get('API_BASE_URL', 'https://api.evidara.app');
    const acsUrl = `${baseUrl}/sso/${organizationId}/saml/acs`;
    const entityId = `${baseUrl}/sso/${organizationId}/saml/metadata`;

    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="1" />
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  // ── SAML ACS Callback ─────────────────────────────────────────────────────

  async handleSamlCallback(
    organizationId: string,
    samlAttributes: Record<string, unknown>,
  ): Promise<{ accessToken: string }> {
    const sso = await this.ssoModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      isEnabled: true,
    });
    if (!sso) throw new BadRequestException('SSO is not configured for this organisation.');

    const mapping = sso.attributeMapping ?? { email: 'email' };
    const email = (samlAttributes[mapping.email] as string)?.toLowerCase();
    if (!email) throw new BadRequestException('SSO response did not include an email attribute.');

    if (sso.allowedDomains?.length) {
      const domain = email.split('@')[1];
      if (!sso.allowedDomains.includes(domain)) {
        throw new ForbiddenException(`Email domain @${domain} is not authorised for this organisation's SSO.`);
      }
    }

    return this.findOrProvisionUser(organizationId, email, sso.defaultRole ?? 'viewer', {
      firstName: samlAttributes[mapping.firstName ?? ''] as string,
      lastName: samlAttributes[mapping.lastName ?? ''] as string,
    });
  }

  // ── OIDC Callback ──────────────────────────────────────────────────────────

  async handleOidcCallback(
    organizationId: string,
    claims: Record<string, unknown>,
  ): Promise<{ accessToken: string }> {
    const sso = await this.ssoModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      isEnabled: true,
    });
    if (!sso) throw new BadRequestException('SSO is not configured for this organisation.');

    const mapping = sso.attributeMapping ?? { email: 'email' };
    const email = (claims[mapping.email] as string)?.toLowerCase();
    if (!email) throw new BadRequestException('OIDC token did not include an email claim.');

    return this.findOrProvisionUser(organizationId, email, sso.defaultRole ?? 'viewer', {
      firstName: claims[mapping.firstName ?? 'given_name'] as string,
      lastName: claims[mapping.lastName ?? 'family_name'] as string,
    });
  }

  // ── User provisioning (JIT) ───────────────────────────────────────────────

  private async findOrProvisionUser(
    organizationId: string,
    email: string,
    defaultRole: string,
    profile: { firstName?: string; lastName?: string },
  ): Promise<{ accessToken: string }> {
    let userDoc = await this.userModel.findOne({ email });

    if (!userDoc) {
      // Just-in-time provisioning — create user with no password
      userDoc = await this.userModel.create({
        email,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || email.split('@')[0],
        passwordHash: '', // SSO users have no password
        organizationId: new Types.ObjectId(organizationId),
      });
    }

    const userId = userDoc._id;

    // Ensure member record exists
    let member = await this.memberModel.findOne({
      userId,
      organizationId: new Types.ObjectId(organizationId),
    });

    if (!member) {
      member = await this.memberModel.create({
        userId,
        organizationId: new Types.ObjectId(organizationId),
        role: (defaultRole as OrgRole) ?? OrgRole.VIEWER,
        status: 'active',
        joinedAt: new Date(),
      });
    }

    const secret = this.config.get<string>('JWT_SECRET', '');
    const accessToken = this.jwtService.sign(
      {
        sub: userId.toString(),
        email: userDoc.email,
        organizationId,
        role: member.role,
        memberId: member._id.toString(),
      },
      { secret, expiresIn: this.config.get('JWT_EXPIRES_IN', '7d') },
    );

    return { accessToken };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertSsoEnabled(organizationId: string) {
    const org = await this.orgModel.findById(organizationId).select('planId').lean();
    if (!org) throw new NotFoundException('Organisation not found.');
    if (!planHasFeature(org.planId, 'hasSso')) {
      throw new ForbiddenException(
        'SSO is available on the Scale plan and above. Upgrade to enable it.',
      );
    }
  }
}