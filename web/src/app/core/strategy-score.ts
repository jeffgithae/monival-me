import { BalancedScorecard, BalancedScorecardObjective, OKRKeyResult } from './models';

// These mirror the API's scoring (bsc.service.ts / okrs.service.ts) so a value
// typed into the page reads the same before and after it is saved.

function ratio(current: number, target: number): number {
  const t = Number(target);
  if (!(t > 0)) return 0;
  return Math.min(100, Math.max(0, ((Number(current) || 0) / t) * 100));
}

export function objectiveScore(o: Pick<BalancedScorecardObjective, 'current' | 'target'>): number {
  return ratio(o.current, o.target);
}

export function keyResultProgress(kr: Pick<OKRKeyResult, 'currentValue' | 'targetValue'>): number {
  return ratio(kr.currentValue, kr.targetValue);
}

/** Weighted by objective weight; a plain average when no objective carries one. */
export function perspectiveScore(objectives: BalancedScorecardObjective[]): number {
  if (!objectives?.length) return 0;
  const weightOf = (o: BalancedScorecardObjective) => (Number(o.weight) > 0 ? Number(o.weight) : 0);
  const total = objectives.reduce((sum, o) => sum + weightOf(o), 0);
  if (total > 0) {
    return Math.round(objectives.reduce((sum, o) => sum + objectiveScore(o) * weightOf(o), 0) / total);
  }
  return Math.round(objectives.reduce((sum, o) => sum + objectiveScore(o), 0) / objectives.length);
}

/** Average of the perspectives that have objectives; null when there is nothing to score yet. */
export function scorecardScore(bsc: Pick<BalancedScorecard, 'perspectives'>): number | null {
  const scored = (bsc.perspectives ?? []).filter((p) => p.objectives?.length);
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, p) => sum + perspectiveScore(p.objectives), 0) / scored.length);
}

export function scoreTone(score: number | null): 'good' | 'warn' | 'bad' | 'none' {
  if (score === null) return 'none';
  if (score >= 80) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

export const PERSPECTIVES = [
  { key: 'financial', label: 'Financial', question: 'How do we sustain and steward our resources?' },
  { key: 'customer', label: 'Customer', question: 'How do the people and partners we serve see us?' },
  { key: 'internal', label: 'Internal process', question: 'What must we excel at to deliver?' },
  { key: 'learning', label: 'Learning & growth', question: 'How do we keep improving and building capacity?' },
] as const;

export type PerspectiveKey = (typeof PERSPECTIVES)[number]['key'];
