export type PlanId = 'trial' | 'starter' | 'professional' | 'organization' | 'scale' | 'enterprise';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  maxProjects: number | null;
  maxUsers: number | null;
  maxIndicatorsPerProject: number | null;
  /**
   * Ceiling on AI Copilot tokens (input + output) an organisation may spend per
   * calendar month. The Copilot is a per-call cost to us, so every plan carries
   * a cap — without one a single account on the cheapest plan can drive
   * unbounded model spend. `null` means uncapped (negotiated contracts only).
   */
  maxAiTokensPerMonth: number | null;
  stripePriceId?: string;
  paystackPlanCode?: string;
  trialDays?: number;
  features: string[];
  // Feature flags for plan gating
  hasApiAccess: boolean;
  hasSso: boolean;
  hasWhiteLabel: boolean;
  hasMultiOrgAggregation: boolean;
  hasDedicatedSupport: boolean;
  hasAuditLog: boolean;
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
    maxAiTokensPerMonth: 50_000,
    trialDays: 14,
    features: ['Logframe & indicators', 'Activity logging', 'Donor reports', 'Up to 3 team members'],
    hasApiAccess: false,
    hasSso: false,
    hasWhiteLabel: false,
    hasMultiOrgAggregation: false,
    hasDedicatedSupport: false,
    hasAuditLog: false,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Small local NGOs and pilot programs',
    monthlyPriceUsd: 79,
    maxProjects: 5,
    maxUsers: 10,
    maxIndicatorsPerProject: 50,
    maxAiTokensPerMonth: 500_000,
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
    paystackPlanCode: process.env.PAYSTACK_PLAN_STARTER,
    features: [
      'Core M&E workspace',
      'Logframes, activities, and approvals',
      'Donor reports',
      'Email support',
    ],
    hasApiAccess: false,
    hasSso: false,
    hasWhiteLabel: false,
    hasMultiOrgAggregation: false,
    hasDedicatedSupport: false,
    hasAuditLog: false,
  },
  professional: {
    id: 'professional',
    name: 'Growth',
    description: 'Multi-donor NGOs with several active programs',
    monthlyPriceUsd: 199,
    maxProjects: 20,
    maxUsers: 50,
    maxIndicatorsPerProject: null,
    maxAiTokensPerMonth: 2_000_000,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL,
    paystackPlanCode: process.env.PAYSTACK_PLAN_PROFESSIONAL,
    features: [
      'Everything in Starter',
      'Grants and budget tracking',
      'Unlimited indicators',
      'Approval workflows',
      'AI report generation',
      'Cloud storage integrations',
    ],
    hasApiAccess: false,
    hasSso: false,
    hasWhiteLabel: false,
    hasMultiOrgAggregation: false,
    hasDedicatedSupport: false,
    hasAuditLog: true,
  },
  organization: {
    id: 'organization',
    name: 'Organization',
    description: 'Portfolio teams, INGOs, and multi-country programs',
    monthlyPriceUsd: 499,
    maxProjects: null,
    maxUsers: null,
    maxIndicatorsPerProject: null,
    maxAiTokensPerMonth: 6_000_000,
    stripePriceId: process.env.STRIPE_PRICE_ORGANIZATION,
    paystackPlanCode: process.env.PAYSTACK_PLAN_ORGANIZATION,
    features: [
      'Everything in Growth',
      'Unlimited projects & users',
      'Portfolio dashboards',
      'REST API access',
      'Custom branding & logo',
      'Priority support',
    ],
    hasApiAccess: true,
    hasSso: false,
    hasWhiteLabel: true,
    hasMultiOrgAggregation: false,
    hasDedicatedSupport: false,
    hasAuditLog: true,
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    description: 'Large INGOs and multi-country portfolios requiring SSO and partner aggregation',
    monthlyPriceUsd: 999,
    maxProjects: null,
    maxUsers: null,
    maxIndicatorsPerProject: null,
    maxAiTokensPerMonth: 15_000_000,
    stripePriceId: process.env.STRIPE_PRICE_SCALE,
    paystackPlanCode: process.env.PAYSTACK_PLAN_SCALE,
    features: [
      'Everything in Organization',
      // SAML is not shipped — its callback is deliberately disabled pending
      // signature verification (see SsoService.handleSamlCallback). Do not
      // re-add it here until that lands.
      'SSO via OpenID Connect (OIDC)',
      'Multi-partner result aggregation',
      'Network-level dashboards',
      'Dedicated success manager',
    ],
    hasApiAccess: true,
    hasSso: true,
    hasWhiteLabel: true,
    hasMultiOrgAggregation: true,
    hasDedicatedSupport: true,
    hasAuditLog: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'UN agencies, bilateral donors, and system integrators — custom contract',
    monthlyPriceUsd: 0, // custom-quoted
    maxProjects: null,
    maxUsers: null,
    maxIndicatorsPerProject: null,
    maxAiTokensPerMonth: null,
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE,
    paystackPlanCode: process.env.PAYSTACK_PLAN_ENTERPRISE,
    features: [
      'Everything in Scale',
      'White-label deployment',
      'Custom SLA',
      'On-premise or private cloud option',
      'Dedicated implementation team',
      'Custom integrations',
    ],
    hasApiAccess: true,
    hasSso: true,
    hasWhiteLabel: true,
    hasMultiOrgAggregation: true,
    hasDedicatedSupport: true,
    hasAuditLog: true,
  },
};

export function getPlan(planId?: string | null): PlanDefinition {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS.trial;
}

/** Check if a plan has a given feature flag */
export function planHasFeature(planId: string | null | undefined, feature: keyof Pick<PlanDefinition,
  'hasApiAccess' | 'hasSso' | 'hasWhiteLabel' | 'hasMultiOrgAggregation' | 'hasDedicatedSupport' | 'hasAuditLog'
>): boolean {
  return getPlan(planId)[feature] === true;
}