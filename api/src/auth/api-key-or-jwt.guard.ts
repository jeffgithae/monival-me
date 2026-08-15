import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { API_KEY_STRATEGY } from '../api-keys/api-key.strategy';

@Injectable()
class ApiKeyGuard extends AuthGuard(API_KEY_STRATEGY) {}

@Injectable()
class JwtGuard extends AuthGuard('jwt') {}

/**
 * Accepts either a session JWT or an Enterprise API key.
 *
 * Which strategy runs is decided by the token shape — API keys are issued with
 * an `mk_live_` prefix — and each request gets its own delegate instance, so
 * nothing per-request is stored on the shared guard.
 *
 * API keys resolve to a `viewer` role (see ApiKeyStrategy), so RolesGuard keeps
 * them read-only on any route guarded by a write permission: a key cannot be
 * used to mutate data even on a controller that shares this guard.
 */
@Injectable()
export class ApiKeyOrJwtAuthGuard implements CanActivate {
  private readonly apiKeyGuard = new ApiKeyGuard();
  private readonly jwtGuard = new JwtGuard();

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'] ?? '';
    const guard = authHeader.startsWith('Bearer mk_live_')
      ? this.apiKeyGuard
      : this.jwtGuard;
    return guard.canActivate(context);
  }
}
