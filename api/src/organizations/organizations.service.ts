import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { getPlan, PlanId } from '../common/constants/plans';
import { Organization } from './schemas/organization.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
  ) {}

  async findById(id: string) {
    const org = await this.orgModel.findById(id).lean();
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    const plan = getPlan(org.planId);
    return {
      id: org._id.toString(),
      name: org.name,
      country: org.country,
      sector: org.sector,
      planId: org.planId,
      planName: plan.name,
      baseCurrency: (org.baseCurrency ?? 'USD').toUpperCase(),
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      currentPeriodEnd: org.currentPeriodEnd,
      limits: {
        maxProjects: plan.maxProjects,
        maxUsers: plan.maxUsers,
        maxIndicatorsPerProject: plan.maxIndicatorsPerProject,
      },
      enterpriseSettings: org.enterpriseSettings,
    };
  }

  async startTrial(orgId: Types.ObjectId, planId: PlanId = 'trial') {
    const plan = getPlan(planId);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + (plan.trialDays ?? 14));
    await this.orgModel.findByIdAndUpdate(orgId, {
      planId,
      subscriptionStatus: 'trialing',
      trialEndsAt,
    });
  }

  async activateSubscription(
    orgId: string,
    data: {
      planId: PlanId;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      paystackCustomerCode?: string;
      paystackSubscriptionCode?: string;
      currentPeriodEnd?: Date;
    },
  ) {
    await this.orgModel.findByIdAndUpdate(orgId, {
      planId: data.planId,
      subscriptionStatus: 'active',
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      paystackCustomerCode: data.paystackCustomerCode,
      paystackSubscriptionCode: data.paystackSubscriptionCode,
      currentPeriodEnd: data.currentPeriodEnd,
      trialEndsAt: undefined,
    });
  }

  async updateSubscriptionStatus(orgId: string, status: string, planId?: PlanId) {
    const update: Record<string, unknown> = { subscriptionStatus: status };
    if (planId) {
      update.planId = planId;
    }
    await this.orgModel.findByIdAndUpdate(orgId, update);
  }

  async updatePlanningFrameworks(orgId: string, frameworks: string[], primary?: string) {
    const validFrameworks = ['logframe', 'bsc', 'okr'];
    const filteredFrameworks = frameworks.filter(f => validFrameworks.includes(f));

    if (filteredFrameworks.length === 0) {
      filteredFrameworks.push('logframe'); // Default fallback
    }

    const primaryFramework = primary && validFrameworks.includes(primary) ? primary : filteredFrameworks[0];

    return this.orgModel.findByIdAndUpdate(
      orgId,
      {
        planningFrameworks: filteredFrameworks,
        primaryFramework,
      },
      { new: true },
    );
  }

  async getPlanningFrameworks(orgId: string) {
    const org = await this.orgModel.findById(orgId).lean();
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    return {
      availableFrameworks: org.planningFrameworks || ['logframe'],
      primaryFramework: org.primaryFramework || 'logframe',
    };
  }

  /**
   * An organisation's own vision, mission and pillars. Nothing is invented for
   * an organisation that has not written one: the page shows an empty state
   * and invites an admin to fill it in.
   */
  async getStrategicOverview(orgId: string) {
    const org = await this.orgModel.findById(orgId).lean();
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    return {
      vision: org.strategicOverview?.vision ?? '',
      mission: org.strategicOverview?.mission ?? '',
      strategicPillars: (org.strategicOverview?.strategicPillars ?? []).map((p) => ({
        pillar: p.pillar,
        description: p.description ?? '',
        initiatives: p.initiatives ?? [],
      })),
    };
  }

  async updateStrategicOverview(
    orgId: string,
    dto: {
      vision?: string;
      mission?: string;
      strategicPillars?: Array<{ pillar: string; description?: string; initiatives?: string[] }>;
    },
  ) {
    const set: Record<string, unknown> = {};
    if (dto.vision !== undefined) set['strategicOverview.vision'] = dto.vision.trim();
    if (dto.mission !== undefined) set['strategicOverview.mission'] = dto.mission.trim();
    if (dto.strategicPillars !== undefined) {
      set['strategicOverview.strategicPillars'] = dto.strategicPillars.map((p) => ({
        pillar: p.pillar.trim(),
        description: (p.description ?? '').trim(),
        initiatives: (p.initiatives ?? []).map((i) => i.trim()).filter((i) => !!i),
      }));
    }
    if (Object.keys(set).length) {
      const updated = await this.orgModel.findByIdAndUpdate(orgId, { $set: set });
      if (!updated) throw new NotFoundException('Organisation not found');
    }
    return this.getStrategicOverview(orgId);
  }

  async updateEnterpriseSettings(
    orgId: string,
    settings: {
      mfaRequired?: boolean;
      ssoEnabled?: boolean;
      ssoProvider?: string;
      ssoMetadataUrl?: string;
      dataResidency?: string;
      allowedDomains?: string[];
    },
  ) {
    return this.orgModel.findByIdAndUpdate(
      orgId,
      { enterpriseSettings: settings },
      { new: true },
    ).lean();
  }
}
