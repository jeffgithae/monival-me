import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@Controller('partners')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly svc: PartnersService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  list(
    @CurrentUser() user: JwtPayload,
    @Query('search')  search?: string,
    @Query('country') country?: string,
  ) {
    return this.svc.list(user.organizationId, { search, country });
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.findOne(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePartnerDto) {
    return this.svc.create(user.organizationId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.svc.update(user.organizationId, id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(user.organizationId, id, user.sub);
  }
}
