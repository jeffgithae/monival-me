import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import * as jose from 'jose';
import { SsoConfig, SsoConfigDocument } from './schemas/sso-config.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { User } from '../users/schemas/user.schema';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { planHasFeature } from '../common/constants/plans';
import { OrgRole } from '../common/constants/roles';
import { decryptField } from '../common/utils/field-encryption';

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

  /**
   * SECURITY: disabled pending a real SAML signature verification
   * implementation (e.g. via @node-saml/passport-saml or samlify).
   *
   * The previous implementation accepted `samlAttributes` directly from
   * the request body with no cryptographic verification against the IdP's
   * signing certificate (`samlCert`) — anyone could POST a fabricated
   * `{ email: "victim@org.com" }` payload to this org's ACS endpoint and
   * receive a valid access token for that user with no proof they ever
   * authenticated with the real identity provider.
   *
   * Do not re-enable this without parsing and verifying the actual SAML
   * Response XML's digital signature first.
   */
  async handleSamlCallback(
    _organizationId: string,
    _samlAttributes: Record<string, unknown>,
  ): Promise<{ accessToken: string }> {
    throw new BadRequestException(
      'SAML SSO is temporarily unavailable while signature verification is implemented. ' +
      'Please use password login or contact support.',
    );
  }

  // ── OIDC Callback ──────────────────────────────────────────────────────────

  /**
   * Exchanges an OIDC authorization code for tokens directly with the
   * identity provider, then cryptographically verifies the returned ID
   * token's signature against the IdP's published JWKS before trusting
   * any claims inside it.
   *
   * SECURITY: this method MUST perform the exchange + signature
   * verification itself. Never accept claims supplied directly by the
   * client (e.g. a raw `claims` object in the request body) — that
   * allows anyone to impersonate any user by POSTing a fabricated
   * `{ email: "victim@org.com" }` payload with no proof of identity.
   */
  async handleOidcCallback(
    organizationId: string,
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string }> {
    const sso = await this.ssoModel
      .findOne({ organizationId: new Types.ObjectId(organizationId), isEnabled: true, protocol: 'oidc' })
      .select('+oidcClientSecret');
    if (!sso) throw new BadRequestException('OIDC SSO is not configured for this organisation.');
    if (!sso.oidcIssuer || !sso.oidcClientId || !sso.oidcClientSecret) {
      throw new BadRequestException('OIDC configuration is incomplete.');
    }

    // 1. Discover the token + jwks endpoints from the issuer
    const discoveryUrl = sso.oidcDiscoveryUrl
      ?? `${sso.oidcIssuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const discovery = await axios.get<{ token_endpoint: string; jwks_uri: string; issuer: string }>(
      discoveryUrl, { timeout: 8000 },
    ).catch(() => {
      throw new BadRequestException('Could not reach the identity provider discovery endpoint.');
    });

    const clientSecret = decryptField(sso.oidcClientSecret);

    // 2. Exchange the authorization code for tokens — this is the step that
    //    proves the caller actually completed a real login at the IdP.
    let idToken: string;
    try {
      const tokenResp = await axios.post<{ id_token: string }>(
        discovery.data.token_endpoint,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: sso.oidcClientId,
          client_secret: clientSecret,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
      );
      idToken = tokenResp.data.id_token;
      if (!idToken) throw new Error('No id_token in token response');
    } catch (err) {
      this.logger.warn(`OIDC code exchange failed for org ${organizationId}`, err);
      throw new UnauthorizedException('OIDC authentication failed — could not exchange code.');
    }

    // 3. Verify the ID token's signature against the IdP's published keys
    //    and validate issuer/audience/expiry. This is the step that was
    //    previously missing entirely — without it, claims cannot be trusted.
    let claims: Record<string, unknown>;
    try {
      const jwks = jose.createRemoteJWKSet(new URL(discovery.data.jwks_uri));
      const { payload } = await jose.jwtVerify(idToken, jwks, {
        issuer: discovery.data.issuer,
        audience: sso.oidcClientId,
      });
      claims = payload as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`OIDC id_token verification failed for org ${organizationId}`, err);
      throw new UnauthorizedException('OIDC token verification failed.');
    }

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
        // Required for the JwtStrategy revocation check — without this,
        // SSO-issued tokens would bypass password-change / forced-logout
        // invalidation entirely (the check is skipped when undefined).
        tokenVersion: userDoc.tokenVersion ?? 0,
      },
      { secret, expiresIn: this.config.get('JWT_EXPIRES_IN', '8h') },
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