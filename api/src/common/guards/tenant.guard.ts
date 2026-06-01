import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantService } from '../../organizations/tenant.service';
import type { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const user = req.user as JwtPayload | undefined;

    if (!user) {
      return true;
    }

    if (!req.tenant) {
      req.tenant = { id: user.organizationId };
      return true;
    }

    if (req.tenant.id && req.tenant.id !== user.organizationId) {
      throw new ForbiddenException('Tenant context does not match your organization');
    }

    if (req.tenant.slug) {
      const org = await this.tenantService.findBySlug(req.tenant.slug);
      if (org._id.toString() !== user.organizationId) {
        throw new ForbiddenException('Tenant slug does not match authenticated organization');
      }
      req.tenant = { ...req.tenant, id: org._id.toString() };
      return true;
    }

    if (req.tenant.domain) {
      const org = await this.tenantService.findByDomain(req.tenant.domain);
      if (org._id.toString() !== user.organizationId) {
        throw new ForbiddenException('Tenant domain does not match authenticated organization');
      }
      req.tenant = { ...req.tenant, id: org._id.toString() };
      return true;
    }

    req.tenant = { ...req.tenant, id: user.organizationId };
    return true;
  }
}
