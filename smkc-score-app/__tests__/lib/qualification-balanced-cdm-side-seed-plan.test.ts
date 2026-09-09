import { buildBalancedCdmSideSeedOverridePlan } from '@/lib/qualification-balanced-cdm-side-seed-plan';
import { buildLegacyCircleCdmScheduleComparisons } from '@/lib/qualification-schedule-comparison';

describe('buildBalancedCdmSideSeedOverridePlan', () => {
  it('projects every supported legacy-circle override onto stable seed positions', () => {
    for (const comparison of buildLegacyCircleCdmScheduleComparisons()) {
      const plan = buildBalancedCdmSideSeedOverridePlan(comparison.playerCount);

      expect(plan).not.toBeNull();
      expect(plan).toHaveLength(comparison.balancedCdmSideOverridePairCount);
      expect(
        new Set(plan!.flatMap((override) => [override.cdmPlayer1Seed, override.cdmPlayer2Seed])).size,
      ).toBe(comparison.balancedCdmSideOverridePlayerCount);

      for (const override of plan!) {
        expect(override.day).toBeGreaterThanOrEqual(1);
        expect(override.cdmPlayer1Seed).toBeGreaterThanOrEqual(1);
        expect(override.cdmPlayer1Seed).toBeLessThanOrEqual(comparison.playerCount);
        expect(override.cdmPlayer2Seed).toBeGreaterThanOrEqual(1);
        expect(override.cdmPlayer2Seed).toBeLessThanOrEqual(comparison.playerCount);
        expect(override.balancedPlayer1Seed).toBe(override.cdmPlayer2Seed);
        expect(override.balancedPlayer2Seed).toBe(override.cdmPlayer1Seed);
      }
    }
  });

  it('returns null for unsupported or invalid player counts', () => {
    expect(buildBalancedCdmSideSeedOverridePlan(13)).toBeNull();
    expect(buildBalancedCdmSideSeedOverridePlan(0)).toBeNull();
    expect(buildBalancedCdmSideSeedOverridePlan(7.5)).toBeNull();
  });
});
