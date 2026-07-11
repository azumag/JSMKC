import { getTaPhase3Rules } from '@/lib/ta/battle-royale';
import {
  getNextPhase3ResetThreshold,
  getPhase3EliminationLimit,
} from '@/lib/ta/finals-phase-manager';

describe('Phase 3 battle royale elimination boundaries', () => {
  const battleRoyaleRules = getTaPhase3Rules(true);

  it.each([
    ['battle royale', battleRoyaleRules, 9, 1, 8],
    ['battle royale', battleRoyaleRules, 6, 1, 5],
    ['battle royale', battleRoyaleRules, 5, 1, 4],
    ['battle royale', battleRoyaleRules, 2, 1, 1],
    ['battle royale', battleRoyaleRules, 1, null, 0],
  ] as const)(
    '%s mode with %i active players uses threshold %s and elimination limit %i',
    (_mode, rules, activeCount, expectedThreshold, expectedLimit) => {
      expect(getNextPhase3ResetThreshold(activeCount, rules)).toBe(
        expectedThreshold,
      );
      expect(getPhase3EliminationLimit(activeCount, rules)).toBe(expectedLimit);
    },
  );

  it('does not expose normal TA life-reset thresholds in battle royale mode', () => {
    expect(battleRoyaleRules.lifeResetThresholds).toEqual([]);
    expect(getNextPhase3ResetThreshold(9, battleRoyaleRules)).toBe(1);
    expect(getNextPhase3ResetThreshold(5, battleRoyaleRules)).toBe(1);
  });
});
