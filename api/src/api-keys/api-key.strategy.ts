import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrgRole } from '../common/constants/roles';

export const API_KEY_STRATEGY = 'api-key';

/**
 * Extracts `Authorization: Bearer mk_live_*` tokens and validates them
 * via ApiKeysService. On success, injects a synthetic JwtPayload-compatible
 * user object so the rest of the app (RolesGuard, CurrentUser) works unchanged.
 */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, API_KEY_STRATEGY) {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly organizationsService: OrganizationsService,
  ) {
    super();
  }

  async validate(req: Request) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer mk_live_')) {
      throw new UnauthorizedException('Missing or invalid API key.');
    }

    const rawKey = authHeader.replace('Bearer ', '').trim();
    const requestIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;

    const ctx = await this.apiKeysService.validate(rawKey, requestIp);

    // Build a minimal user context compatible with JwtPayload
    const org = await this.organizationsService.findById(ctx.organizationId);

    return {
      sub: `apikey:${ctx.keyId}`,
      email: `apikey@${org.id}`,
      organizationId: ctx.organizationId,
      role: OrgRole.VIEWER, // API keys get read-access role by default; scope checks happen separately
      memberId: ctx.keyId,
      isApiKey: true,
      scopes: ctx.scopes,
    };
  }
}