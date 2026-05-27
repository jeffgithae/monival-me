import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { OKRService } from './okrs.service';
import { CreateOKRDto, UpdateOKRDto, UpdateKeyResultDto } from './dto/okr.dto';

@Controller('okrs')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
export class OKRController {
  constructor(private okrService: OKRService) {}

  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  async create(@CurrentUser() user: any, @Body() createDto: CreateOKRDto) {
    return this.okrService.create(user.organizationId, createDto);
  }

  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('quarter') quarter?: string,
    @Query('year') year?: string,
    @Query('ownerUserId') ownerUserId?: string,
  ) {
    return this.okrService.findAll(user.organizationId, {
      status,
      quarter: quarter ? parseInt(quarter, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
      ownerUserId,
    });
  }

  @Get('quarterly/:year/:quarter')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async getQuarterlyOKRs(
    @CurrentUser() user: any,
    @Param('year') year: string,
    @Param('quarter') quarter: string,
  ) {
    return this.okrService.getQuarterlyOKRs(
      user.organizationId,
      parseInt(year, 10),
      parseInt(quarter, 10),
    );
  }

  @Get(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.okrService.findOne(id, user.organizationId);
  }

  @Get(':id/progress')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  async getProgress(@CurrentUser() user: any, @Param('id') id: string) {
    return this.okrService.getProgress(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateOKRDto,
  ) {
    return this.okrService.update(id, user.organizationId, updateDto);
  }

  @Patch(':id/key-result/:krIndex')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE)
  async updateKeyResult(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('krIndex') krIndex: string,
    @Body() updateDto: UpdateKeyResultDto,
  ) {
    return this.okrService.updateKeyResult(id, parseInt(krIndex, 10), user.organizationId, updateDto);
  }

  @Post(':id/mark-reviewed')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  async markAsReviewed(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { reviewerUserId: string }) {
    return this.okrService.markAsReviewed(id, user.organizationId, body.reviewerUserId);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.okrService.delete(id, user.organizationId);
  }
}
