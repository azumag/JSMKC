import {
  buildBalancedCdmSideOverridePlan,
  buildBalancedCdmSidePreviewSchedule,
  buildLegacyCircleCdmScheduleComparisons,
} from '@/lib/qualification-schedule-comparison';
import { generateRoundRobinSchedule } from '@/lib/round-robin';

function pairKey(player1Id: string, player2Id: string) {
  return [player1Id, player2Id].sort().join(':');
}

describe('buildBalancedCdmSideOverridePlan', () => {
  it('returns the exact CDM-side reversals used by the balanced preview', () => {
    const playerIds = Array.from({ length: 8 }, (_, index) => `P${index + 1}`);
    const cdm = generateRoundRobinSchedule(playerIds, { method: 'cdm' });
    const preview = buildBalancedCdmSidePreviewSchedule(playerIds);
    const overrides = buildBalancedCdmSideOverridePlan(playerIds);

    expect(preview).not.toBeNull();
    expect(overrides).not.toBeNull();

    const cdmMatches = new Map(
      cdm.matches
        .filter((match) => !match.isBye)
        .map((match) => [pairKey(match.player1Id, match.player2Id), match] as const),
    );
    const previewMatches = new Map(
      preview!.matches
        .filter((match) => !match.isBye)
        .map((match) => [pairKey(match.player1Id, match.player2Id), match] as const),
    );

    for (const override of overrides!) {
      const key = pairKey(override.cdmPlayer1Id, override.cdmPlayer2Id);
      const cdmMatch = cdmMatches.get(key);
      const previewMatch = previewMatches.get(key);

      expect(override.balancedPlayer1Id).toBe(override.cdmPlayer2Id);
      expect(override.balancedPlayer2Id).toBe(override.cdmPlayer1Id);
      expect(override.day).toBe(cdmMatch?.day);
      expect(previewMatch?.day).toBe(override.day);
      expect(previewMatch?.player1Id).toBe(override.balancedPlayer1Id);
      expect(previewMatch?.player2Id).toBe(override.balancedPlayer2Id);
    }
  });

  it('matches the existing side-impact counts for every supported legacy-circle size', () => {
    for (const comparison of buildLegacyCircleCdmScheduleComparisons()) {
      const playerIds = Array.from({ length: comparison.playerCount }, (_, index) => `P${index + 1}`);
      const overrides = buildBalancedCdmSideOverridePlan(playerIds);

      expect(overrides).not.toBeNull();
      expect(overrides).toHaveLength(comparison.pairSideChangedCount);
      expect(new Set(overrides!.flatMap((override) => [override.cdmPlayer1Id, override.cdmPlayer2Id])).size).toBe(
        comparison.playerSideChangedCount,
      );
    }
  });

  it('returns null when the requested player count has no CDM fixture', () => {
    const playerIds = Array.from({ length: 13 }, (_, index) => `P${index + 1}`);
    expect(buildBalancedCdmSideOverridePlan(playerIds)).toBeNull();
  });
});
