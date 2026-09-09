import { buildLegacyCircleCdmScheduleComparisons } from '@/lib/qualification-schedule-comparison';

describe('CDM side imbalance seed impact', () => {
  it('identifies the seeded players whose fixed CDM orientation exceeds the unavoidable minimum', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();

    expect(
      comparisons.map(
        ({ playerCount, cdmExcessSideImbalancePlayerCount, cdmExcessSideImbalanceSeedPositions }) => ({
          playerCount,
          cdmExcessSideImbalancePlayerCount,
          cdmExcessSideImbalanceSeedPositions,
        }),
      ),
    ).toEqual([
      {
        playerCount: 7,
        cdmExcessSideImbalancePlayerCount: 5,
        cdmExcessSideImbalanceSeedPositions: [2, 3, 4, 5, 7],
      },
      {
        playerCount: 8,
        cdmExcessSideImbalancePlayerCount: 4,
        cdmExcessSideImbalanceSeedPositions: [2, 3, 4, 7],
      },
      {
        playerCount: 9,
        cdmExcessSideImbalancePlayerCount: 8,
        cdmExcessSideImbalanceSeedPositions: [1, 2, 3, 4, 6, 7, 8, 9],
      },
      {
        playerCount: 10,
        cdmExcessSideImbalancePlayerCount: 7,
        cdmExcessSideImbalanceSeedPositions: [1, 2, 3, 6, 7, 8, 9],
      },
      {
        playerCount: 11,
        cdmExcessSideImbalancePlayerCount: 9,
        cdmExcessSideImbalanceSeedPositions: [2, 3, 4, 5, 6, 7, 8, 9, 11],
      },
      {
        playerCount: 12,
        cdmExcessSideImbalancePlayerCount: 7,
        cdmExcessSideImbalanceSeedPositions: [2, 3, 5, 6, 8, 11, 12],
      },
    ]);
  });

  it('keeps the seed list consistent with the aggregate affected-player count', () => {
    for (const comparison of buildLegacyCircleCdmScheduleComparisons()) {
      expect(comparison.cdmExcessSideImbalanceSeedPositions).toHaveLength(
        comparison.cdmExcessSideImbalancePlayerCount,
      );
      expect(new Set(comparison.cdmExcessSideImbalanceSeedPositions).size).toBe(
        comparison.cdmExcessSideImbalanceSeedPositions.length,
      );
      expect(
        comparison.cdmExcessSideImbalanceSeedPositions.every(
          (seedPosition) => seedPosition >= 1 && seedPosition <= comparison.playerCount,
        ),
      ).toBe(true);
    }
  });
});
