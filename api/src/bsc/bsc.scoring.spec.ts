import { objectiveScore, perspectiveScore } from './bsc.service';
import { keyResultProgress } from '../okrs/okrs.service';

describe('strategy scoring', () => {
  describe('objectiveScore', () => {
    it('is the share of target reached, capped at 100', () => {
      expect(objectiveScore({ current: 25, target: 100 })).toBe(25);
      expect(objectiveScore({ current: 150, target: 100 })).toBe(100);
    });

    it('treats a zero or missing target as no progress rather than NaN or Infinity', () => {
      expect(objectiveScore({ current: 5, target: 0 })).toBe(0);
      expect(objectiveScore({ current: 5, target: undefined as unknown as number })).toBe(0);
    });
  });

  describe('perspectiveScore', () => {
    it('weights objectives by their weight', () => {
      const score = perspectiveScore([
        { current: 100, target: 100, weight: 75 },
        { current: 0, target: 100, weight: 25 },
      ]);
      expect(score).toBe(75);
    });

    it('weights in proportion when the weights do not add up to 100', () => {
      const score = perspectiveScore([
        { current: 100, target: 100, weight: 10 },
        { current: 0, target: 100, weight: 30 },
      ]);
      expect(score).toBe(25);
    });

    it('falls back to a plain average when no objective carries a weight', () => {
      const score = perspectiveScore([
        { current: 100, target: 100, weight: 0 },
        { current: 50, target: 100, weight: 0 },
      ]);
      expect(score).toBe(75);
    });

    it('is zero for a perspective with no objectives', () => {
      expect(perspectiveScore([])).toBe(0);
    });
  });

  describe('keyResultProgress', () => {
    it('is capped at 100 and never negative or NaN', () => {
      expect(keyResultProgress({ currentValue: 1, targetValue: 4 })).toBe(25);
      expect(keyResultProgress({ currentValue: 9, targetValue: 4 })).toBe(100);
      expect(keyResultProgress({ currentValue: 3, targetValue: 0 })).toBe(0);
    });
  });
});
