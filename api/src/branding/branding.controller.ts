import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { BrandingService, UpdateBrandingDto } from './branding.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../common/guards/feature.guard';

@Controller('branding')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  /**
   * GET /branding?domain=m&e.acme.org
   * Public endpoint — returns branding config for a given custom domain.
   * Used by the Angular app at bootstrap to apply custom colours/logo.
   */
  @Get()
  getBranding(@Query('domain') domain?: string, @Query('orgId') orgId?: string) {
    if (domain) return this.brandingService.getBrandingByDomain(domain);
    if (orgId) return this.brandingService.getBrandingByOrgId(orgId);
    return null;
  }

  /**
   * GET /branding/current
   * Get the current org's branding config (authenticated).
   */
  @Get('current')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  getCurrent(@CurrentUser() user: JwtPayload) {
    return this.brandingService.getBrandingByOrgId(user.organizationId);
  }

  /**
   * PATCH /branding
   * Update branding config (requires hasWhiteLabel plan feature).
   */
  @Patch()
  @UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
  @RequireFeature('hasWhiteLabel')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  upsert(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBrandingDto) {
    return this.brandingService.upsertBranding(user.organizationId, dto);
  }

  /**
   * POST /branding/domain/initiate
   * Get the DNS TXT record needed to verify a custom domain.
   */
  @Post('domain/initiate')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
  @RequireFeature('hasWhiteLabel')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  initiateDomainVerification(@CurrentUser() user: JwtPayload) {
    return this.brandingService.initiateDomainVerification(user.organizationId);
  }

  /**
   * POST /branding/domain/verify
   * Attempt to verify custom domain ownership via DNS TXT lookup.
   */
  @Post('domain/verify')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
  @RequireFeature('hasWhiteLabel')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  verifyDomain(@CurrentUser() user: JwtPayload) {
    return this.brandingService.verifyDomain(user.organizationId);
  }
}