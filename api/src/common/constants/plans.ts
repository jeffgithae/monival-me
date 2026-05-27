export type PlanId = 'trial' | 'starter' | 'professional';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  maxProjects: number;
  maxUsers: number;
  maxIndicatorsPerProject: number;
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
    description: 'Small NGOs and community organisations',
    monthlyPriceUsd: 49,
    maxProjects: 5,
    maxUsers: 10,
    maxIndicatorsPerProject: 50,
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
    features: ['Everything in trial', '5 active projects', '10 users', 'Email support'],
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'INGOs and multi-project portfolios',
    monthlyPriceUsd: 149,
    maxProjects: 50,
    maxUsers: 30,
    maxIndicatorsPerProject: 200,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL,
    features: [
      'Unlimited donor reports',
      'Approval workflows',
      '30 users',
      'Priority support',
    ],
  },
};

export function getPlan(planId?: string | null): PlanDefinition {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS.trial;
}
