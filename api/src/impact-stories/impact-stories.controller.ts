import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS, OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { ImpactStoriesService, CreateImpactStoryDto } from './impact-stories.service';
import type { StoryStatus } from './schemas/impact-story.schema';

@Controller('impact-stories')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ImpactStoriesController {
  constructor(private readonly svc: ImpactStoriesService) {}

  /** GET /impact-stories — list all stories (staff) */
  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('projectId')         projectId?: string,
    @Query('status')            status?: string,
    @Query('thematicArea')      thematicArea?: string,
    @Query('tag')               tag?: string,
    @Query('search')            search?: string,
    @Query('page')              page?: string,
    @Query('limit')             limit?: string,
  ) {
    return this.svc.findAll(user.organizationId, {
      projectId, thematicArea, tag, search,
      status: status as StoryStatus | undefined,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** GET /impact-stories/public — publicly visible published stories */
  @Get('public')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findPublic(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findPublic(user.organizationId, {
      projectId, tag, search,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** GET /impact-stories/stats */
  @Get('stats')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  stats(@CurrentUser() user: JwtPayload) {
    return this.svc.stats(user.organizationId);
  }

  /** GET /impact-stories/:id */
  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.findOne(user.organizationId, id);
  }

  /** POST /impact-stories — create draft */
  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateImpactStoryDto) {
    return this.svc.create(user.organizationId, user.sub, dto);
  }

  /** PATCH /impact-stories/:id — edit content */
  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateImpactStoryDto>,
  ) {
    return this.svc.update(user.organizationId, id, dto);
  }

  /** PATCH /impact-stories/:id/status — move through the workflow */
  @Patch(':id/status')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: StoryStatus },
  ) {
    return this.svc.updateStatus(user.organizationId, id, body.status, user.sub);
  }

  /** DELETE /impact-stories/:id */
  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(user.organizationId, id);
  }
}