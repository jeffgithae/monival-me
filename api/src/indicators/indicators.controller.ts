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
import { ApiOperation } from '@nestjs/swagger';
import { ApiKeyOrJwtAuthGuard } from '../auth/api-key-or-jwt.guard';
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
// Authenticates a session JWT or an Enterprise API key. API keys resolve to the
// `viewer` role, so RolesGuard confines them to the read routes below.
@UseGuards(ApiKeyOrJwtAuthGuard, SubscriptionGuard, RolesGuard)
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

  /**
   * Server-computed achievement for every indicator on a project.
   *
   * Declared before `@Get(':id')` so the literal segment wins the route match.
   * Clients must use this rather than summing activity quantities themselves —
   * an activity list is paginated and unfiltered by status, so a client-side
   * sum silently under-reports past the first page and counts drafts.
   */
  @Get('project/:projectId/achievement')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Achievement per indicator for a project (server-computed)' })
  achievementForProject(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.indicatorsService.achievementForProject(user.organizationId, projectId);
  }

  /** Full performance picture: totals, monthly + per-period trend, disaggregation, annual targets. */
  @Get(':id/performance')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  performance(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.indicatorsService.performance(user.organizationId, id);
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