import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { SsoService, UpsertSsoConfigDto } from './sso.service';
import { OidcCallbackBody, SamlAcsBody, ToggleSsoEnforcementBody, UpsertSsoConfigBody } from '../common/dto/request-bodies.dto';

// ── Admin endpoints (JWT-authenticated org admins) ────────────────────────────

@Controller('sso')
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  /**
   * GET /sso/config
   * Get current org's SSO configuration (secrets redacted).
   */
  @Get('config')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
  @RequireFeature('hasSso')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.ssoService.getConfig(user.organizationId);
  }

  /**
   * POST /sso/config
   * Create or update SSO configuration for the organisation.
   */
  @Post('config')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
  @RequireFeature('hasSso')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  upsertConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpsertSsoConfigBody) {
    return this.ssoService.upsertConfig(user.organizationId, dto);
  }

  /**
   * PATCH /sso/config/enforce
   * Toggle whether SSO login is mandatory (blocks password login).
   */
  @Patch('config/enforce')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
  @RequireFeature('hasSso')
  @Roles(OrgRole.OWNER)
  toggleEnforcement(
    @CurrentUser() user: JwtPayload,
    @Body() body: ToggleSsoEnforcementBody,
  ) {
    return this.ssoService.toggleEnforcement(user.organizationId, body.enforce);
  }

  // ── Public callback endpoints (no JWT) ────────────────────────────────────

  /**
   * GET /sso/:orgId/saml/metadata
   *
   * SAML SP metadata XML. Kept reachable so an administrator who already
   * configured an IdP can still fetch the SP descriptor, but note that the ACS
   * endpoint below is disabled — see SsoService.handleSamlCallback. SAML is not
   * an advertised capability until signature verification ships.
   */
  @Get(':orgId/saml/metadata')
  getSamlMetadata(@Param('orgId') orgId: string, @Res() res: Response) {
    const xml = this.ssoService.getSpMetadata(orgId);
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  }

  /**
   * POST /sso/:orgId/saml/acs
   *
   * SAML Assertion Consumer Service. Currently always rejects: the service
   * refuses to mint a token from unverified assertions, because the previous
   * implementation trusted request-body attributes with no signature check —
   * an unauthenticated account-takeover hole. Use OIDC, which is fully
   * implemented with JWKS signature verification.
   */
  @Post(':orgId/saml/acs')
  async samlAcs(
    @Param('orgId') orgId: string,
    @Body() body: SamlAcsBody,
    @Res() res: Response,
  ) {
    const { accessToken } = await this.ssoService.handleSamlCallback(orgId, body.attributes ?? body);
    // Redirect to web app with token in fragment — SPA picks it up
    const webBase = process.env.WEB_BASE_URL ?? 'https://app.evidara.app';
    res.redirect(`${webBase}/sso-callback#token=${accessToken}`);
  }

  /**
   * POST /sso/:orgId/oidc/callback
   * OIDC authorization code callback. The frontend forwards the `code`
   * it received from the identity provider's redirect; the service
   * performs the actual token exchange and signature verification
   * server-side — the client never supplies claims directly.
   */
  @Post(':orgId/oidc/callback')
  handleOidcCallback(
    @Param('orgId') orgId: string,
    @Body() body: OidcCallbackBody,
  ) {
    return this.ssoService.handleOidcCallback(orgId, body.code, body.redirectUri);
  }
}