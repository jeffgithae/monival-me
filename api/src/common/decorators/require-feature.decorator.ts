import { SetMetadata } from '@nestjs/common';
import type { PlanDefinition } from '../constants/plans';

export type PlanFeatureFlag = keyof Pick<PlanDefinition,
  | 'hasApiAccess'
  | 'hasSso'
  | 'hasWhiteLabel'
  | 'hasMultiOrgAggregation'
  | 'hasDedicatedSupport'
  | 'hasAuditLog'
>;

export const FEATURE_KEY = 'required_feature';

/** Attach to a controller or handler — FeatureGuard will enforce the plan flag. */
export const RequireFeature = (...features: PlanFeatureFlag[]) =>
  SetMetadata(FEATURE_KEY, features);