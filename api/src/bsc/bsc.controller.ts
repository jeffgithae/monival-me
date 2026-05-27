import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { BalancedScorecardService } from './bsc.service';
import { CreateBalancedScorecardDto, UpdateBalancedScorecardDto, UpdateObjectiveDto } from './dto/balanced-scorecard.dto';

@Controller('bsc')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class BalancedScorecardController {
  constructor(private bscService: BalancedScorecardService) {}

  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  async create(@CurrentUser() user: any, @Body() createDto: CreateBalancedScorecardDto) {
    return this.bscService.create(user.organizationId, createDto);
  }

  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async findAll(
    @CurrentUser() user: any,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('status') status?: string,
  ) {
    return this.bscService.findAll(user.organizationId, {
      fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : undefined,
      status,
    });
  }

  @Get(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bscService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateBalancedScorecardDto,
  ) {
    return this.bscService.update(id, user.organizationId, updateDto);
  }

  @Patch(':id/objective/:perspectiveIndex/:objectiveIndex')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE)
  async updateObjective(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('perspectiveIndex') perspectiveIndex: string,
    @Param('objectiveIndex') objectiveIndex: string,
    @Body() updateDto: UpdateObjectiveDto,
  ) {
    return this.bscService.updateObjective(
      id,
      parseInt(perspectiveIndex, 10),
      parseInt(objectiveIndex, 10),
      user.organizationId,
      updateDto,
    );
  }

  @Get(':id/performance')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async getPerformanceSummary(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bscService.getPerformanceSummary(id, user.organizationId);
  }

  @Post(':id/mark-reviewed')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  async markAsReviewed(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { reviewerUserId: string }) {
    return this.bscService.markAsReviewed(id, user.organizationId, body.reviewerUserId);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bscService.delete(id, user.organizationId);
  }
}
