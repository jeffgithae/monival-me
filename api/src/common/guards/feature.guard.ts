import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FEATURE_KEY, PlanFeatureFlag } from '../decorators/require-feature.decorator';
import { planHasFeature } from '../constants/plans';
import { Organization } from '../../organizations/schemas/organization.schema';
import type { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<Organization>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PlanFeatureFlag[]>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!user?.organizationId) return false;

    const org = await this.orgModel
      .findById(user.organizationId)
      .select('planId')
      .lean();

    const planId = org?.planId as string | undefined;

    for (const feature of required) {
      if (!planHasFeature(planId, feature)) {
        const featureLabels: Record<PlanFeatureFlag, string> = {
          hasApiAccess: 'REST API access',
          hasSso: 'SSO / SAML login',
          hasWhiteLabel: 'White-labelling',
          hasMultiOrgAggregation: 'Multi-partner aggregation',
          hasDedicatedSupport: 'Dedicated support',
          hasAuditLog: 'Audit log',
        };
        throw new ForbiddenException(
          `Your current plan does not include ${featureLabels[feature]}. ` +
          `Upgrade to Scale or Enterprise to unlock this feature.`,
        );
      }
    }

    return true;
  }
}