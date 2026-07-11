import { getTaPhase3Rules } from '@/lib/ta/battle-royale';
import {
  getNextPhase3ResetThreshold,
  getPhase3EliminationLimit,
} from '@/lib/ta/finals-phase-manager';

describe('Phase 3 mode-specific elimination boundaries', () => {
  const standardRules = getTaPhase3Rules(false);
  const battleRoyaleRules = getTaPhase3Rules(true);

  it.each([
    ['standard', standardRules, 9, 8, 1],
    ['standard', standardRules, 8, 4, 4],
    ['standard', standardRules, 5, 4, 1],
    ['standard', standardRules, 4, 2, 2],
    ['standard', standardRules, 2, 1, 1],
    ['standard', standardRules, 1, null, 0],
    ['battle royale', battleRoyaleRules, 9, 1, 8],
    ['battle royale', battleRoyaleRules, 6, 1, 5],
    ['battle royale', battleRoyaleRules, 5, 1, 4],
    ['battle royale', battleRoyaleRules, 2, 1, 1],
    ['battle royale', battleRoyaleRules, 1, null, 0],
  ] as const)(
    '%s mode with %i active players uses threshold %s and elimination limit %i',
    (_mode, rules, activeCount, expectedThreshold, expectedLimit) => {
      expect(getNextPhase3ResetThreshold(activeCount, rules)).toBe(expectedThreshold);
      expect(getPhase3EliminationLimit(activeCount, rules)).toBe(expectedLimit);
    },
  );

  it('does not expose normal TA life-reset thresholds in battle royale mode', () => {
    expect(battleRoyaleRules.lifeResetThresholds).toEqual([]);
    expect(getNextPhase3ResetThreshold(9, battleRoyaleRules)).toBe(1);
    expect(getNextPhase3ResetThreshold(5, battleRoyaleRules)).toBe(1);
  });

  it('keeps the normal TA 8/4/2 reset boundaries', () => {
    expect(standardRules.lifeResetThresholds).toEqual([8, 4, 2]);
    expect(getNextPhase3ResetThreshold(9, standardRules)).toBe(8);
    expect(getNextPhase3ResetThreshold(8, standardRules)).toBe(4);
    expect(getNextPhase3ResetThreshold(4, standardRules)).toBe(2);
  });
});
