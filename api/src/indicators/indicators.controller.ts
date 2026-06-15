import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { IndicatorsService } from './indicators.service';

@Controller('indicators')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('isCore') isCore?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.indicatorsService.findAll(user.organizationId, {
      projectId,
      level,
      search,
      isCore: isCore === 'true' ? true : isCore === 'false' ? false : undefined,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.indicatorsService.findOne(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateIndicatorDto) {
    return this.indicatorsService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIndicatorDto,
  ) {
    return this.indicatorsService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.indicatorsService.remove(user.organizationId, id);
  }
}