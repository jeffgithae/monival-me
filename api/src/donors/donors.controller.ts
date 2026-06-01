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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
import { DonorsService } from './donors.service';

@Controller('donors')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class DonorsController {
  constructor(private readonly donorsService: DonorsService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.donorsService.findAll(user.organizationId);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.findOne(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDonorDto) {
    return this.donorsService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_DONORS)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDonorDto,
  ) {
    return this.donorsService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.donorsService.remove(user.organizationId, id);
  }
}
