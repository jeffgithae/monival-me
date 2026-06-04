import {
  Body, Controller, Delete, Get, Param,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  // ─── List & find ───────────────────────────────────────────────────────────

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'List projects with filtering, search, and pagination' })
  @ApiQuery({ name: 'status',     required: false })
  @ApiQuery({ name: 'sector',     required: false })
  @ApiQuery({ name: 'donorId',    required: false })
  @ApiQuery({ name: 'tag',        required: false })
  @ApiQuery({ name: 'search',     required: false })
  @ApiQuery({ name: 'isArchived', required: false })
  @ApiQuery({ name: 'isTemplate', required: false })
  @ApiQuery({ name: 'page',       required: false })
  @ApiQuery({ name: 'limit',      required: false })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status')     status?: string,
    @Query('sector')     sector?: string,
    @Query('donorId')    donorId?: string,
    @Query('tag')        tag?: string,
    @Query('search')     search?: string,
    @Query('isArchived') isArchived?: string,
    @Query('isTemplate') isTemplate?: string,
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.svc.findAll(user.organizationId, {
      status, sector, donorId, tag, search,
      isArchived: isArchived !== undefined ? isArchived === 'true' : undefined,
      isTemplate: isTemplate !== undefined ? isTemplate === 'true' : undefined,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('portfolio-stats')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Organisation-level portfolio statistics' })
  portfolioStats(@CurrentUser() user: JwtPayload) {
    return this.svc.portfolioStats(user.organizationId);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Get single project' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.findOne(user.organizationId, id);
  }

  @Get(':id/summary')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Rich summary: indicators, activities, health, milestones, risks, data quality' })
  summary(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.summary(user.organizationId, id);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Create project' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.svc.create(user.organizationId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Update project' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.svc.update(user.organizationId, id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Permanently delete project' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(user.organizationId, id, user.sub);
  }

  // ─── Lifecycle actions ─────────────────────────────────────────────────────

  @Patch(':id/archive')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Archive a project (soft close, keeps data)' })
  archive(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.svc.archive(user.organizationId, id, body.notes ?? '', user.sub);
  }

  @Patch(':id/close')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Close a project with closure date and lessons learned' })
  close(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: { closureDate: string; lessonsLearned?: string; evaluationSummary?: string },
  ) {
    return this.svc.close(user.organizationId, id, dto, user.sub);
  }

  @Post(':id/duplicate')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Duplicate project (copies structure + indicators, resets data)' })
  duplicate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    return this.svc.duplicate(user.organizationId, id, body.name, user.sub);
  }

  @Post(':id/refresh-data-quality')
  @Roles(...PERMISSIONS.MANAGE_INDICATORS)
  @ApiOperation({ summary: 'Recalculate and persist data quality score' })
  refreshDataQuality(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.refreshDataQuality(user.organizationId, id);
  }

  // ─── Milestones ────────────────────────────────────────────────────────────

  @Post(':id/milestones')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Add a milestone' })
  addMilestone(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addMilestone(user.organizationId, id, dto, user.sub);
  }

  @Patch(':id/milestones/:milestoneId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Update a milestone' })
  updateMilestone(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: any,
  ) {
    return this.svc.updateMilestone(user.organizationId, id, milestoneId, dto, user.sub);
  }

  @Delete(':id/milestones/:milestoneId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Remove a milestone' })
  removeMilestone(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.svc.removeMilestone(user.organizationId, id, milestoneId, user.sub);
  }

  // ─── Risk register ─────────────────────────────────────────────────────────

  @Post(':id/risks')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Add a risk' })
  addRisk(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addRisk(user.organizationId, id, dto, user.sub);
  }

  @Patch(':id/risks/:riskId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Update a risk' })
  updateRisk(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('riskId') riskId: string,
    @Body() dto: any,
  ) {
    return this.svc.updateRisk(user.organizationId, id, riskId, dto, user.sub);
  }

  @Delete(':id/risks/:riskId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Remove a risk' })
  removeRisk(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('riskId') riskId: string,
  ) {
    return this.svc.removeRisk(user.organizationId, id, riskId, user.sub);
  }

  // ─── Workplan ──────────────────────────────────────────────────────────────

  @Post(':id/workplan')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Add a workplan item' })
  addWorkplanItem(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addWorkplanItem(user.organizationId, id, dto, user.sub);
  }

  @Patch(':id/workplan/:itemId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Update a workplan item' })
  updateWorkplanItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: any,
  ) {
    return this.svc.updateWorkplanItem(user.organizationId, id, itemId, dto, user.sub);
  }

  @Delete(':id/workplan/:itemId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Remove a workplan item' })
  removeWorkplanItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.svc.removeWorkplanItem(user.organizationId, id, itemId, user.sub);
  }

  // ─── Stakeholders ──────────────────────────────────────────────────────────

  @Post(':id/stakeholders')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Add a stakeholder' })
  addStakeholder(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addStakeholder(user.organizationId, id, dto);
  }

  @Patch(':id/stakeholders/:stakeholderId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Update a stakeholder' })
  updateStakeholder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('stakeholderId') stakeholderId: string,
    @Body() dto: any,
  ) {
    return this.svc.updateStakeholder(user.organizationId, id, stakeholderId, dto);
  }

  @Delete(':id/stakeholders/:stakeholderId')
  @Roles(...PERMISSIONS.MANAGE_PROJECTS)
  @ApiOperation({ summary: 'Remove a stakeholder' })
  removeStakeholder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('stakeholderId') stakeholderId: string,
  ) {
    return this.svc.removeStakeholder(user.organizationId, id, stakeholderId);
  }
}