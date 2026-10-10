import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgRole, PERMISSIONS } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // The log records the before and after of every change in the organisation,
  // budgets and grants included, so it is for the people who run it — as the
  // menu already says.
  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  list(
    @CurrentUser() user: JwtPayload,
    @Query('entityType') entityType?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('userId') userEmail?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.list(user.organizationId, {
      entityType: entityType || entity,
      entityId,
      action,
      userEmail,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
