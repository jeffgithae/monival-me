import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERMISSIONS } from '../common/constants/roles';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';

@Controller('partners')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly svc: PartnersService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  list(@Req() req: any) {
    return this.svc.list(req.user.organizationId);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  create(@Req() req: any, @Body() body: CreatePartnerDto) {
    return this.svc.create(req.user.organizationId, body);
  }
}