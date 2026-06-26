import {
  Body, Controller, Delete, Get, Param,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto, ProgramEnrollmentDto, ServiceRecordDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@ApiTags('Beneficiaries')
@Controller('beneficiaries')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class BeneficiariesController {
  constructor(private readonly svc: BeneficiariesService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'List beneficiaries with demographic filters and pagination' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('projectId')        projectId?: string,
    @Query('status')           status?: string,
    @Query('registrationType') registrationType?: string,
    @Query('sex')              sex?: string,
    @Query('ageGroup')         ageGroup?: string,
    @Query('hasDisability')    hasDisability?: string,
    @Query('isIdp')            isIdp?: string,
    @Query('isRefugee')        isRefugee?: string,
    @Query('search')           search?: string,
    @Query('page')             page?: string,
    @Query('limit')            limit?: string,
  ) {
    return this.svc.list(user.organizationId, {
      projectId, status, registrationType, sex, ageGroup, search,
      hasDisability: hasDisability !== undefined ? hasDisability === 'true' : undefined,
      isIdp:         isIdp         !== undefined ? isIdp         === 'true' : undefined,
      isRefugee:     isRefugee     !== undefined ? isRefugee     === 'true' : undefined,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('statistics')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Aggregated beneficiary statistics: by sex, age group, type, vulnerability flags' })
  statistics(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.svc.statistics(user.organizationId, projectId);
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_REPORTS)
  @ApiOperation({ summary: 'Get single beneficiary with full profile' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.findOne(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_BENEFICIARIES)
  @ApiOperation({ summary: 'Register a new beneficiary' })
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateBeneficiaryDto) {
    return this.svc.create(user.organizationId, body);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_BENEFICIARIES)
  @ApiOperation({ summary: 'Update beneficiary profile' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateBeneficiaryDto,
  ) {
    return this.svc.update(user.organizationId, id, body);
  }

  @Post(':id/enroll')
  @Roles(...PERMISSIONS.MANAGE_BENEFICIARIES)
  @ApiOperation({ summary: 'Enroll beneficiary in a project program' })
  enroll(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ProgramEnrollmentDto,
  ) {
    return this.svc.enroll(user.organizationId, id, dto);
  }

  @Patch(':id/exit/:projectId')
  @Roles(...PERMISSIONS.MANAGE_BENEFICIARIES)
  @ApiOperation({ summary: 'Exit beneficiary from a program' })
  exit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @Body() body: { exitReason?: string },
  ) {
    return this.svc.exitProgram(user.organizationId, id, projectId, body.exitReason);
  }

  @Post(':id/service-records')
  @Roles(...PERMISSIONS.MANAGE_BENEFICIARIES)
  @ApiOperation({ summary: 'Add a service delivery record to a beneficiary' })
  addServiceRecord(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ServiceRecordDto,
  ) {
    return this.svc.addServiceRecord(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Delete beneficiary record' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(user.organizationId, id);
  }

  // ── Deduplication ──────────────────────────────────────────────────────────

  @Get('duplicates/scan')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  @ApiOperation({ summary: 'Scan for duplicate beneficiary records (same nationalId or phone)' })
  findDuplicates(
    @CurrentUser() user: JwtPayload,
    @Query('minConfidence') minConfidence?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.svc.findDuplicates(user.organizationId, {
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
      projectId,
    });
  }

  @Post('duplicates/merge')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Merge a duplicate record into a primary beneficiary record' })
  mergeBeneficiaries(
    @CurrentUser() user: JwtPayload,
    @Body() body: { primaryId: string; duplicateId: string },
  ) {
    return this.svc.mergeBeneficiaries(user.organizationId, body.primaryId, body.duplicateId);
  }

  /**
   * PWA Offline Sync Endpoint.
   *
   * Field workers register beneficiaries in the mobile PWA while offline.
   * When connectivity is restored, the client pushes the queued batch here.
   *
   * Each record must include a `clientId` (client-generated UUID) used as an
   * idempotency key — the server skips any record whose clientId has already
   * been persisted, preventing duplicate registrations on retry. A genuine
   * nationalId/phone conflict with an existing beneficiary is still reported
   * back as a per-record error, since that's a real duplicate-person concern
   * the fuzzy-dedup engine and a human reviewer should resolve, not silently
   * merge.
   *
   * Returns per-record results so the PWA can selectively clear synced items
   * from local IndexedDB storage.
   */
  @Post('offline-sync')
  @Roles(...PERMISSIONS.MANAGE_BENEFICIARIES)
  @ApiOperation({
    summary: 'PWA offline sync — push a batch of beneficiaries registered without connectivity',
    description: 'Each item must include a clientId (UUID) for idempotency. Already-synced records are skipped, not duplicated.',
  })
  offlineSync(
    @CurrentUser() user: JwtPayload,
    @Body() body: { beneficiaries: Array<CreateBeneficiaryDto & { clientId: string }> },
  ) {
    return this.svc.offlineSync(user.organizationId, body.beneficiaries);
  }
}