import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { ApiKeysService, CreateApiKeyDto } from './api-keys.service';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, RolesGuard)
@RequireFeature('hasApiAccess')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * POST /api-keys
   * Create a new API key. The raw key is returned ONCE — store it securely.
   */
  @Post()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(user.organizationId, user.sub, dto);
  }

  /**
   * GET /api-keys
   * List all active API keys (hashes never exposed).
   */
  @Get()
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.apiKeysService.findAll(user.organizationId);
  }

  /**
   * DELETE /api-keys/:id
   * Permanently revoke an API key.
   */
  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  revoke(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.apiKeysService.revoke(user.organizationId, id);
  }
}