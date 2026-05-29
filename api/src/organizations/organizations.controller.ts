import { Controller, Get, Post, Patch, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  current(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.findById(user.organizationId);
  }

  @Get('frameworks')
  getFrameworks(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.getPlanningFrameworks(user.organizationId);
  }

  @Patch('frameworks')
  @UseGuards(RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async updateFrameworks(
    @CurrentUser() user: JwtPayload,
    @Body() body: { frameworks: string[]; primary?: string },
  ) {
    return this.organizationsService.updatePlanningFrameworks(user.organizationId, body.frameworks, body.primary);
  }

  @Get('strategic-overview')
  getStrategicOverview(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.getStrategicOverview(user.organizationId);
  }

  @Patch('enterprise-settings')
  @UseGuards(RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  updateEnterpriseSettings(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      mfaRequired?: boolean;
      ssoEnabled?: boolean;
      ssoProvider?: string;
      ssoMetadataUrl?: string;
      dataResidency?: string;
      allowedDomains?: string[];
    },
  ) {
    return this.organizationsService.updateEnterpriseSettings(user.organizationId, body);
  }
}
