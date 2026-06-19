import {
  Body, Controller, Delete, Get, Param,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateActivityTemplateDto } from './dto/create-activity-template.dto';

class ReviewDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @IsOptional() @IsString()
  rejectionReason?: string;
}

class BulkReviewDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  ids!: string[];
}

@ApiTags('Activities')
@Controller('activities')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  // ─── List & find ───────────────────────────────────────────────────────────

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'List activities with filtering and pagination' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('projectId')     projectId?: string,
    @Query('indicatorId')   indicatorId?: string,
    @Query('beneficiaryId') beneficiaryId?: string,
    @Query('status')        status?: string,
    @Query('activityType')  activityType?: string,
    @Query('partnerId')     partnerId?: string,
    @Query('grantId')       grantId?: string,
    @Query('fromDate')      fromDate?: string,
    @Query('toDate')        toDate?: string,
    @Query('search')        search?: string,
    @Query('page')          page?: string,
    @Query('limit')         limit?: string,
  ) {
    return this.svc.findAll(user.organizationId, {
      projectId, indicatorId, beneficiaryId, status, activityType, partnerId, grantId, fromDate, toDate, search,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('statistics')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Activity statistics: totals, by type, by month, by location, participant breakdown' })
  statistics(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.svc.statistics(user.organizationId, projectId);
  }

  @Get('templates')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'List activity templates' })
  templates(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.svc.findTemplates(user.organizationId, projectId);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Get a single activity' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.findOne(user.organizationId, id);
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  @Post()
  @Roles(...PERMISSIONS.LOG_ACTIVITIES)
  @ApiOperation({ summary: 'Log a single activity' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateActivityDto) {
    return this.svc.create(user.organizationId, dto, user.role, user.sub);
  }

  @Post('bulk')
  @Roles(...PERMISSIONS.LOG_ACTIVITIES)
  @ApiOperation({ summary: 'Bulk-create multiple activities (e.g. CSV import)' })
  bulkCreate(@CurrentUser() user: JwtPayload, @Body() body: { activities: CreateActivityDto[] }) {
    return this.svc.bulkCreate(user.organizationId, body.activities, user.role, user.sub);
  }

  @Post('templates')
  @Roles(...PERMISSIONS.LOG_ACTIVITIES)
  @ApiOperation({ summary: 'Save an activity template' })
  createTemplate(@CurrentUser() user: JwtPayload, @Body() dto: CreateActivityTemplateDto) {
    return this.svc.createTemplate(user.organizationId, dto);
  }

  // ─── Review ────────────────────────────────────────────────────────────────

  @Patch(':id/review')
  @Roles(...PERMISSIONS.APPROVE_ACTIVITIES)
  @ApiOperation({ summary: 'Approve or reject an activity' })
  review(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.svc.review(user.organizationId, id, user.sub, dto.status, dto.rejectionReason);
  }

  @Patch('bulk-review')
  @Roles(...PERMISSIONS.APPROVE_ACTIVITIES)
  @ApiOperation({ summary: 'Bulk approve or reject multiple submitted activities' })
  bulkReview(@CurrentUser() user: JwtPayload, @Body() dto: BulkReviewDto) {
    return this.svc.bulkReview(user.organizationId, dto.ids, user.sub, dto.status);
  }

  // ─── Update & delete ───────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(...PERMISSIONS.LOG_ACTIVITIES)
  @ApiOperation({ summary: 'Update an activity' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.svc.update(user.organizationId, id, dto, user.sub);
  }

  @Delete('templates/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  @ApiOperation({ summary: 'Delete an activity template' })
  removeTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.removeTemplate(user.organizationId, id);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  @ApiOperation({ summary: 'Delete an activity' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(user.organizationId, id, user.sub);
  }
}