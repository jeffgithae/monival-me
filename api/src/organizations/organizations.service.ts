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
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      currentPeriodEnd?: Date;
    },
  ) {
    await this.orgModel.findByIdAndUpdate(orgId, {
      planId: data.planId,
      subscriptionStatus: 'active',
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
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

  async getStrategicOverview(orgId: string) {
    const org = await this.orgModel.findById(orgId).lean();
    if (!org) {
      throw new NotFoundException('Organisation not found');
    }
    return {
      vision: org.strategicOverview?.vision ?? 'Our vision is to strengthen community health and resilience through integrated program delivery.',
      mission: org.strategicOverview?.mission ?? 'Deliver evidence-based, community-led solutions that improve the quality of life for vulnerable populations.',
      strategicPillars: org.strategicOverview?.strategicPillars || [
        {
          pillar: 'Health Systems Strengthening',
          description: 'Build resilient health systems with skilled workforce and quality data systems.',
          initiatives: ['Maternal health integration', 'CHW capacity building', 'HMIS strengthening'],
        },
        {
          pillar: 'Community Engagement & Ownership',
          description: 'Foster community leadership and sustained behavior change.',
          initiatives: ['Water committee formation', 'Health committee activation', 'Beneficiary accountability'],
        },
        {
          pillar: 'Data for Decision-Making',
          description: 'Use real-time data to drive adaptive management and accountability.',
          initiatives: ['Dashboard implementation', 'Data literacy training', 'Quality assurance protocols'],
        },
        {
          pillar: 'Financial Sustainability',
          description: 'Develop diversified funding and cost-recovery mechanisms.',
          initiatives: ['Water tariff systems', 'Community health insurance', 'Grant diversification'],
        },
      ],
    };
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
