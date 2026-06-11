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
  upsertConfig(@CurrentUser() user: JwtPayload, @Body() dto: UpsertSsoConfigDto) {
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
    @Body() body: { enforce: boolean },
  ) {
    return this.ssoService.toggleEnforcement(user.organizationId, body.enforce);
  }

  // ── Public callback endpoints (no JWT) ────────────────────────────────────

  /**
   * GET /sso/:orgId/saml/metadata
   * SAML SP metadata XML — paste this into your IdP.
   */
  @Get(':orgId/saml/metadata')
  getSamlMetadata(@Param('orgId') orgId: string, @Res() res: Response) {
    const xml = this.ssoService.getSpMetadata(orgId);
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  }

  /**
   * POST /sso/:orgId/saml/acs
   * SAML Assertion Consumer Service — IdP posts the assertion here.
   * In production this should use passport-saml to verify the signature.
   * Here we accept pre-parsed attributes from the SAML middleware layer.
   */
  @Post(':orgId/saml/acs')
  async samlAcs(
    @Param('orgId') orgId: string,
    @Body() body: { attributes: Record<string, unknown> },
    @Res() res: Response,
  ) {
    const { accessToken } = await this.ssoService.handleSamlCallback(orgId, body.attributes ?? body);
    // Redirect to web app with token in fragment — SPA picks it up
    const webBase = process.env.WEB_BASE_URL ?? 'https://app.monival.app';
    res.redirect(`${webBase}/sso-callback#token=${accessToken}`);
  }

  /**
   * POST /sso/:orgId/oidc/callback
   * OIDC authorization code callback — exchange code for claims server-side.
   */
  @Post(':orgId/oidc/callback')
  handleOidcCallback(
    @Param('orgId') orgId: string,
    @Body() body: { claims: Record<string, unknown> },
  ) {
    return this.ssoService.handleOidcCallback(orgId, body.claims ?? body);
  }
}