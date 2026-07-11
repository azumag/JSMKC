import { applyTaHandicap, getTaPhase3Rules, isTaHandicapSeconds, TA_HANDICAP_SECONDS } from '@/lib/ta/battle-royale';

describe('TA battle royale rules', () => {
  it('accepts only the four tournament handicap tiers', () => {
    expect(TA_HANDICAP_SECONDS).toEqual([0, -1, -3, -5]);
    for (const value of TA_HANDICAP_SECONDS) expect(isTaHandicapSeconds(value)).toBe(true);
    for (const value of [1, -2, -4, -6, '0', null]) expect(isTaHandicapSeconds(value)).toBe(false);
  });

  it('subtracts the handicap from a raw course time without going below zero', () => {
    expect(applyTaHandicap(65_432, -3)).toBe(62_432);
    expect(applyTaHandicap(2_000, -5)).toBe(0);
  });

  it('uses 10 lives with no reset thresholds in battle royale mode', () => {
    expect(getTaPhase3Rules(true)).toEqual(
      expect.objectContaining({ initialLives: 10, lifeResetThresholds: [], handicapEnabled: true }),
    );
  });

  it('preserves the normal Phase 3 rules outside battle royale mode', () => {
    expect(getTaPhase3Rules(false)).toEqual(
      expect.objectContaining({ initialLives: 3, lifeResetThresholds: [8, 4, 2], handicapEnabled: false }),
    );
  });
});
