export type PlanId = 'trial' | 'starter' | 'professional' | 'organization';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  maxProjects: number | null;
  maxUsers: number | null;
  maxIndicatorsPerProject: number | null;
  stripePriceId?: string;
  trialDays?: number;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: 'Free trial',
    description: '14-day full access for new organisations',
    monthlyPriceUsd: 0,
    maxProjects: 2,
    maxUsers: 3,
    maxIndicatorsPerProject: 15,
    trialDays: 14,
    features: ['Logframe & indicators', 'Activity logging', 'Donor reports', 'Up to 3 team members'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Small local NGOs and pilot programs',
    monthlyPriceUsd: 99,
    maxProjects: 3,
    maxUsers: 10,
    maxIndicatorsPerProject: 50,
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
    features: [
      'Core M&E workspace',
      'Logframes, activities, and approvals',
      'Donor reports',
      'Email support',
    ],
  },
  professional: {
    id: 'professional',
    name: 'Growth',
    description: 'Multi-donor NGOs with several active programs',
    monthlyPriceUsd: 299,
    maxProjects: 15,
    maxUsers: 50,
    maxIndicatorsPerProject: null,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL,
    features: [
      'Everything in Starter',
      'Grants and budget tracking',
      'Unlimited indicators',
      'Approval workflows',
      'Audit log and API access',
    ],
  },
  organization: {
    id: 'organization',
    name: 'Organization',
    description: 'Portfolio teams, INGOs, and multi-country programs',
    monthlyPriceUsd: 699,
    maxProjects: null,
    maxUsers: null,
    maxIndicatorsPerProject: null,
    stripePriceId: process.env.STRIPE_PRICE_ORGANIZATION,
    features: [
      'Everything in Growth',
      'Portfolio dashboards',
      'Custom branding',
      'Priority support',
      'Onboarding and migration assistance',
    ],
  },
};

export function getPlan(planId?: string | null): PlanDefinition {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS.trial;
}
