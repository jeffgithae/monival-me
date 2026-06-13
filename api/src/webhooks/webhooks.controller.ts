import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { WEBHOOK_EVENTS } from './schemas/webhook.schema';
import { WebhooksService, CreateWebhookDto } from './webhooks.service';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  /** GET /webhooks/events — list all subscribable event types */
  @Get('events')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  listEvents() {
    return { events: WEBHOOK_EVENTS };
  }

  /** GET /webhooks — list org's webhook subscriptions */
  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.svc.findAll(user.organizationId);
  }

  /**
   * POST /webhooks — create a webhook subscription.
   * Returns the signing secret ONCE — store it securely.
   */
  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWebhookDto) {
    return this.svc.create(user.organizationId, user.sub, dto);
  }

  /** PATCH /webhooks/:id — update name, events, active status */
  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateWebhookDto> & { isActive?: boolean },
  ) {
    return this.svc.update(user.organizationId, id, dto);
  }

  /** POST /webhooks/:id/rotate-secret — generate a new signing secret */
  @Post(':id/rotate-secret')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  rotateSecret(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.rotateSecret(user.organizationId, id);
  }

  /** DELETE /webhooks/:id */
  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.svc.remove(user.organizationId, id);
  }
}