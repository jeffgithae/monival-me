import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationsService } from '../../organizations/organizations.service';
import type { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly organizationsService: OrganizationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!user?.organizationId) {
      return true;
    }

    let org;
    try {
      org = await this.organizationsService.findById(user.organizationId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new ForbiddenException('Organisation not found');
      }
      throw err;
    }

    const now = new Date();
    if (org.subscriptionStatus === 'trialing' && org.trialEndsAt && org.trialEndsAt > now) {
      return true;
    }
    if (org.subscriptionStatus === 'active') {
      return true;
    }
    if (
      org.subscriptionStatus === 'trialing' &&
      (!org.trialEndsAt || org.trialEndsAt <= now)
    ) {
      throw new ForbiddenException(
        'Your free trial has ended. Subscribe in Billing settings to continue.',
      );
    }
    throw new ForbiddenException(
      'An active subscription is required. Go to Billing to subscribe.',
    );
  }
}
