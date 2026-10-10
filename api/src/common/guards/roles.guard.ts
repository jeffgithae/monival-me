import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '../constants/roles';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../types/jwt-payload';

/**
 * What an API key may call. Keys are read-only. A key with no scopes keeps
 * the full read access keys have always had; a key with scopes is limited to
 * `<resource>:read` (or `*`), where the resource is the first path segment
 * after the API prefix — `indicators:read` covers `/api/indicators/...`.
 */
export function apiKeyMayAccess(scopes: string[], method: string, url: string): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  if (!scopes.length || scopes.includes('*')) return true;
  const resource = url.split('?')[0].replace(/^\/+/, '').replace(/^api\//, '').split('/')[0];
  return scopes.includes(`${resource}:read`) || scopes.includes(resource);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<OrgRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload; method: string; path?: string; originalUrl?: string }>();
    const { user } = request;

    // API keys are checked before anything else, including on routes that
    // name no roles: they read, they never write, and a key issued with
    // scopes reaches only the resources those scopes name.
    if (user?.isApiKey && !apiKeyMayAccess(user.scopes ?? [], request.method, request.originalUrl ?? request.path ?? '')) {
      return false;
    }

    if (!required?.length) {
      return true;
    }
    if (!user) {
      return false;
    }
    return required.includes(user.role);
  }
}
