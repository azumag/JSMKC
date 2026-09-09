import { buildLegacyCircleCdmScheduleComparisons } from '@/lib/qualification-schedule-comparison';

describe('CDM side imbalance seed impact', () => {
  it('identifies the seeded players whose fixed CDM orientation exceeds the unavoidable minimum', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();
    const affectedCounts = comparisons.map((comparison) => comparison.cdmExcessSideImbalancePlayerCount);
    const affectedSeeds = comparisons.map((comparison) => comparison.cdmExcessSideImbalanceSeedPositions);

    expect(affectedCounts).toEqual([5, 4, 8, 7, 9, 7]);
    expect(affectedSeeds).toEqual([
      [2, 3, 4, 5, 7],
      [2, 3, 4, 7],
      [1, 2, 3, 4, 6, 7, 8, 9],
      [1, 2, 3, 6, 7, 8, 9],
      [2, 3, 4, 5, 6, 7, 8, 9, 11],
      [2, 3, 5, 6, 8, 11, 12],
    ]);
  });
});
