import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PERMISSIONS } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { StakeholderFeedbackService, CreateFeedbackDto, FeedbackListQuery } from './stakeholder-feedback.service';
import { FeedbackStatus } from './schemas/stakeholder-feedback.schema';

@ApiTags('Stakeholder Feedback')
@Controller('stakeholder-feedback')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class StakeholderFeedbackController {
  constructor(private readonly service: StakeholderFeedbackService) {}

  @Post()
  @Roles(...PERMISSIONS.MANAGE_STAKEHOLDER_FEEDBACK)
  @ApiOperation({ summary: 'Submit a new stakeholder feedback record' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFeedbackDto) {
    return this.service.create(user.organizationId, user.sub, dto);
  }

  @Get()
  @Roles(...PERMISSIONS.VIEW_STAKEHOLDER_FEEDBACK)
  @ApiOperation({ summary: 'List stakeholder feedback with filters' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: FeedbackListQuery) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get('analytics')
  @Roles(...PERMISSIONS.VIEW_STAKEHOLDER_FEEDBACK)
  @ApiOperation({ summary: 'Sentiment & thematic analytics across all feedback' })
  analytics(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string) {
    return this.service.analytics(user.organizationId, projectId);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_STAKEHOLDER_FEEDBACK)
  @ApiOperation({ summary: 'Get a single feedback record' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Patch(':id/action')
  @Roles(...PERMISSIONS.MANAGE_STAKEHOLDER_FEEDBACK)
  @ApiOperation({ summary: 'Update feedback status and log an action taken' })
  action(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: FeedbackStatus; action: string; notes?: string },
  ) {
    return this.service.action(user.organizationId, id, user.sub, body.status, body.action, body.notes);
  }

  @Delete(':id')
  @Roles(...PERMISSIONS.MANAGE_STAKEHOLDER_FEEDBACK)
  @ApiOperation({ summary: 'Delete a feedback record' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}