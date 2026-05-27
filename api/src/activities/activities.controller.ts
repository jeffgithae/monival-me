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
import { IsIn } from 'class-validator';
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

class ReviewDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';
}

@Controller('activities')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findAll(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string) {
    return this.activitiesService.findAll(user.organizationId, projectId);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.activitiesService.findOne(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.LOG_ACTIVITIES)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(
      user.organizationId,
      dto,
      user.role,
      user.sub,
    );
  }

  @Patch(':id/review')
  @Roles(...PERMISSIONS.APPROVE_ACTIVITIES)
  review(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.activitiesService.review(
      user.organizationId,
      id,
      user.sub,
      dto.status,
    );
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.LOG_ACTIVITIES)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.activitiesService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.activitiesService.remove(user.organizationId, id);
  }
}
