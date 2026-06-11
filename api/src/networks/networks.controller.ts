import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { NetworksService, CreateNetworkDto, InviteMemberDto } from './networks.service';

@Controller('networks')
@UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
@RequireFeature('hasMultiOrgAggregation')
export class NetworksController {
  constructor(private readonly networksService: NetworksService) {}

  /** POST /networks — create a new partner network */
  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateNetworkDto) {
    return this.networksService.create(user.organizationId, dto);
  }

  /** GET /networks — list networks this org belongs to */
  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.networksService.findAllForOrg(user.organizationId);
  }

  /** GET /networks/:id — get network detail */
  @Get(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.networksService.findOne(id, user.organizationId);
  }

  /** POST /networks/:id/members — invite a partner org */
  @Post(':id/members')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  inviteMember(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.networksService.inviteMember(id, user.organizationId, user.sub, dto);
  }

  /** PATCH /networks/:id/members/respond — accept or decline an invitation */
  @Patch(':id/members/respond')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  respond(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { accept: boolean },
  ) {
    return this.networksService.respondToInvite(id, user.organizationId, body.accept);
  }

  /** DELETE /networks/:id/members/:orgId — remove a member */
  @Delete(':id/members/:orgId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('orgId') orgId: string,
  ) {
    return this.networksService.removeMember(id, user.organizationId, orgId);
  }

  /**
   * GET /networks/:id/rollup
   * Cross-org aggregated results: indicators, activities, projects.
   */
  @Get(':id/rollup')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  rollup(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.networksService.rollup(id, user.organizationId);
  }
}