/**
 * Direction-aware progress-percentage calculation.
 *
 * Indicator.direction ('increasing' | 'decreasing' | 'maintain') was always
 * captured at indicator-creation time but never actually read by any of the
 * percentage/efficiency calculations across the app — every one of them
 * computed a naive `achieved / target * 100`, which only gives a sensible
 * answer for 'increasing' indicators. For a 'decreasing' indicator (e.g.
 * "reduce % of children with stunting" — baseline 30%, target 15%), naive
 * achieved/target math on an achieved value of 20% gives 133%, which reads
 * as wild over-achievement when the real picture is "67% of the way there".
 * Worse, if the rate got WORSE (e.g. rose to 25%), naive math still shows
 * 167% — looking like over-achievement for a result that's actually a
 * regression.
 *
 * This function is the single place that logic lives, so every call site
 * (dashboard insights, ROI, copilot, reporting results) agrees on what
 * "progress" means for a given indicator, rather than each computing its
 * own (previously direction-blind) version.
 */

export type IndicatorDirection = 'increasing' | 'decreasing' | 'maintain';

export interface ProgressInput {
  achieved: number;
  target: number;
  /** Required for 'decreasing' and 'maintain' directions — see below. Optional for 'increasing', where it isn't needed. */
  baseline?: number | null;
  direction?: IndicatorDirection | string | null;
}

/**
 * Returns a 0-100+ progress percentage, or null when the calculation isn't
 * meaningful (e.g. target is 0 for an increasing indicator, or baseline
 * equals target so "distance travelled" is undefined).
 *
 * - increasing: achieved / target * 100 (uncapped — over-achievement shows as >100%)
 * - decreasing: how far achieved has moved from baseline toward target,
 *   as a percentage of the total distance that needed covering. Capped at
 *   0-150% — overshooting the target further than baseline-to-target
 *   distance still shows as meaningful over-achievement (150%) without
 *   producing wild, uninterpretable numbers from a near-zero denominator.
 * - maintain: 100% at the target value, decaying as achieved drifts away
 *   from it in either direction, scaled against the baseline-target gap
 *   (or 10% of target if baseline==target) so the scale is reasonable.
 */
export function calculateProgressPct(input: ProgressInput): number | null {
  const { achieved, target } = input;
  const direction = (input.direction ?? 'increasing') as IndicatorDirection;
  const baseline = input.baseline ?? null;

  if (direction === 'decreasing') {
    if (baseline === null) {
      // No baseline recorded — fall back to the simple inverse-ratio
      // reading (lower achieved relative to target is better), since we
      // have nothing else to measure distance against.
      if (target <= 0) return null;
      const pct = (1 - (achieved - target) / target) * 100;
      return Math.round(pct * 10) / 10;
    }
    const totalDistance = baseline - target; // positive when baseline > target, as expected for a reduction goal
    if (totalDistance === 0) return achieved === target ? 100 : null;
    const distanceCovered = baseline - achieved;
    const pct = (distanceCovered / totalDistance) * 100;
    return Math.round(Math.max(0, Math.min(150, pct)) * 10) / 10;
  }

  if (direction === 'maintain') {
    const gap = baseline !== null && baseline !== target
      ? Math.abs(baseline - target)
      : Math.abs(target) * 0.1 || 1; // fall back to a 10% band when no usable baseline
    const deviation = Math.abs(achieved - target);
    const pct = Math.max(0, 100 - (deviation / gap) * 100);
    return Math.round(pct * 10) / 10;
  }

  // increasing (default)
  if (target <= 0) return null;
  const pct = (achieved / target) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Buckets a progress percentage into the efficiency tiers used across the
 * dashboards. Centralised so 'high'/'medium'/'low' thresholds can't drift
 * between the ROI view, insights, and reporting period results.
 */
export function efficiencyTier(progressPct: number | null): 'high' | 'medium' | 'low' | 'no_data' {
  if (progressPct === null || progressPct <= 0) return 'no_data';
  if (progressPct >= 80) return 'high';
  if (progressPct >= 50) return 'medium';
  return 'low';
}