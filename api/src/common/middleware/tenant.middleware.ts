import { Request, Response, NextFunction } from 'express';

/**
 * Tenant resolver middleware
 * - Prefer header `x-tenant-id` if present
 * - Fallback to subdomain (tenant.example.com)
 * - Attach `req.tenant = { id?, slug? }`
 *
 * Services should read tenant from request (or from validated JWT claims).
 */
export function tenantResolver(req: Request & { tenant?: any }, _res: Response, next: NextFunction) {
  // 1) header
  const headerTenant = req.header('x-tenant-id');
  if (headerTenant) {
    req.tenant = { id: headerTenant };
    return next();
  }

  // 2) host/subdomain or custom domain
  const host = req.headers.host || '';
  const hostOnly = host.split(':')[0];
  const parts = hostOnly.split('.');
  const localHost = hostOnly === 'localhost' || hostOnly.startsWith('127.0.0.1');

  if (!localHost && parts.length >= 3) {
    const subdomain = parts[0];
    if (subdomain && subdomain !== 'www') {
      req.tenant = { slug: subdomain };
      return next();
    }
  }

  if (!localHost && parts.length >= 2) {
    req.tenant = { domain: hostOnly };
    return next();
  }

  // 3) fallback: unknown tenant (leave undefined)
  req.tenant = undefined;
  return next();
}
