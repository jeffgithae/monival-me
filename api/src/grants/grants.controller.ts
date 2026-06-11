import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { GrantsService } from './grants.service';
import { CreateGrantDto } from './dto/create-grant.dto';
import { UpdateGrantDto } from './dto/update-grant.dto';

@Controller('grants')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class GrantsController {
  constructor(private grantsService: GrantsService) {}

  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async create(@CurrentUser() user: any, @Body() createGrantDto: CreateGrantDto) {
    return this.grantsService.create(user.organizationId, createGrantDto);
  }

  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('donorId') donorId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.grantsService.findAll(user.organizationId, {
      status, donorId, search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('summary')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getSummary(@CurrentUser() user: any) {
    return this.grantsService.getBudgetSummary(user.organizationId);
  }

  @Get('budget-summary')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.VIEWER)
  async getBudgetSummary(@CurrentUser() user: any) {
    return this.getSummary(user);
  }

  @Get('expiring')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async getExpiringGrants(@CurrentUser() user: any, @Query('days') days?: string) {
    const daysUntilExpiry = days ? parseInt(days, 10) : 30;
    return this.grantsService.getExpiringGrants(user.organizationId, daysUntilExpiry);
  }

  @Get('by-project/:projectId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)
  async getGrantsByProject(@CurrentUser() user: any, @Param('projectId') projectId: string) {
    return this.grantsService.getGrantsByProject(user.organizationId, projectId);
  }

  @Get(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.grantsService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateGrantDto: UpdateGrantDto,
  ) {
    return this.grantsService.update(id, user.organizationId, updateGrantDto);
  }

  @Patch(':id/spending')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async updateSpending(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { amountSpent: number },
  ) {
    return this.grantsService.updateGrantSpending(id, user.organizationId, body.amountSpent);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.grantsService.remove(id, user.organizationId);
  }
}