import {
  buildLegacyCircleCdmScheduleComparisons,
  compareCircleAndCdmQualificationSchedules,
} from '@/lib/qualification-schedule-comparison';

describe('compareCircleAndCdmQualificationSchedules', () => {
  it('compares the same seeded players without changing the real round-robin pair set', () => {
    const comparison = compareCircleAndCdmQualificationSchedules(8);

    expect(comparison).not.toBeNull();
    expect(comparison).toEqual(
      expect.objectContaining({
        playerCount: 8,
        cdmFixtureCapacity: 8,
        cdmBreakSlotCount: 0,
        realMatchCount: 28,
        circleTotalDays: 7,
        cdmTotalDays: 7,
        circleMaxSideImbalance: 1,
        cdmMaxSideImbalance: 3,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 4,
        pairSetDifferenceCount: 0,
        balancedCdmSidePlanAvailable: true,
        balancedCdmMaxSideImbalance: 1,
        balancedCdmExcessSideImbalancePlayerCount: 0,
        byeAssignmentChangedPlayerCount: 0,
      }),
    );
    expect(comparison!.pairDayChangedCount).toBeGreaterThan(0);
    expect(comparison!.playerDayChangedCount).toBeGreaterThan(0);
    expect(comparison!.playerDayChangedCount).toBeLessThanOrEqual(comparison!.playerCount);
    expect(comparison!.playerSideChangedCount).toBeLessThanOrEqual(comparison!.playerCount);
    expect(comparison!.balancedCdmSideOverridePairCount).toBe(comparison!.pairSideChangedCount);
    expect(comparison!.balancedCdmSideOverridePlayerCount).toBe(comparison!.playerSideChangedCount);
  });

  it('keeps odd-player BREAK effects visible in the comparison evidence', () => {
    const comparison = compareCircleAndCdmQualificationSchedules(7);

    expect(comparison).not.toBeNull();
    expect(comparison).toEqual(
      expect.objectContaining({
        playerCount: 7,
        cdmFixtureCapacity: 8,
        cdmBreakSlotCount: 1,
        realMatchCount: 21,
        circleTotalDays: 7,
        cdmTotalDays: 7,
        circleMaxSideImbalance: 0,
        cdmMaxSideImbalance: 4,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 5,
        pairSetDifferenceCount: 0,
        balancedCdmSidePlanAvailable: true,
        balancedCdmMaxSideImbalance: 0,
        balancedCdmExcessSideImbalancePlayerCount: 0,
      }),
    );
  });

  it('returns null when the requested player count has no CDM fixture', () => {
    expect(compareCircleAndCdmQualificationSchedules(13)).toBeNull();
    expect(compareCircleAndCdmQualificationSchedules(21)).toBeNull();
  });
});

describe('buildLegacyCircleCdmScheduleComparisons', () => {
  it('covers every fixture-supported legacy-circle size and verifies complete pair coverage', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();

    expect(comparisons.map((comparison) => comparison.playerCount)).toEqual([7, 8, 9, 10, 11, 12]);
    for (const comparison of comparisons) {
      expect(comparison.realMatchCount).toBe((comparison.playerCount * (comparison.playerCount - 1)) / 2);
      expect(comparison.cdmTotalDays).toBe(comparison.circleTotalDays);
      expect(comparison.pairSetDifferenceCount).toBe(0);
      expect(comparison.pairDayChangedCount).toBeGreaterThan(0);
      expect(comparison.playerDayChangedCount).toBeGreaterThan(0);
      expect(comparison.playerDayChangedCount).toBeLessThanOrEqual(comparison.playerCount);
      expect(comparison.pairSideChangedCount).toBeGreaterThanOrEqual(0);
      expect(comparison.playerSideChangedCount).toBeGreaterThanOrEqual(0);
      expect(comparison.playerSideChangedCount).toBeLessThanOrEqual(comparison.playerCount);
      expect(comparison.balancedCdmSidePlanAvailable).toBe(true);
      expect(comparison.balancedCdmSideOverridePairCount).toBe(comparison.pairSideChangedCount);
      expect(comparison.balancedCdmSideOverridePlayerCount).toBe(comparison.playerSideChangedCount);
      expect(comparison.balancedCdmMaxSideImbalance).toBe(comparison.circleMaxSideImbalance);
      expect(comparison.balancedCdmExcessSideImbalancePlayerCount).toBe(
        comparison.circleExcessSideImbalancePlayerCount,
      );
      expect(comparison.byeAssignmentChangedPlayerCount).toBeGreaterThanOrEqual(0);
      expect(comparison.circleExcessSideImbalancePlayerCount).toBe(0);
    }
  });

  it('quantifies the 1P/2P balance cost of adopting the fixed CDM fixtures', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();

    expect(
      comparisons.map(
        ({
          playerCount,
          circleMaxSideImbalance,
          cdmMaxSideImbalance,
          circleExcessSideImbalancePlayerCount,
          cdmExcessSideImbalancePlayerCount,
        }) => ({
          playerCount,
          circleMaxSideImbalance,
          cdmMaxSideImbalance,
          circleExcessSideImbalancePlayerCount,
          cdmExcessSideImbalancePlayerCount,
        }),
      ),
    ).toEqual([
      {
        playerCount: 7,
        circleMaxSideImbalance: 0,
        cdmMaxSideImbalance: 4,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 5,
      },
      {
        playerCount: 8,
        circleMaxSideImbalance: 1,
        cdmMaxSideImbalance: 3,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 4,
      },
      {
        playerCount: 9,
        circleMaxSideImbalance: 0,
        cdmMaxSideImbalance: 4,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 8,
      },
      {
        playerCount: 10,
        circleMaxSideImbalance: 1,
        cdmMaxSideImbalance: 5,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 7,
      },
      {
        playerCount: 11,
        circleMaxSideImbalance: 0,
        cdmMaxSideImbalance: 6,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 9,
      },
      {
        playerCount: 12,
        circleMaxSideImbalance: 1,
        cdmMaxSideImbalance: 5,
        circleExcessSideImbalancePlayerCount: 0,
        cdmExcessSideImbalancePlayerCount: 7,
      },
    ]);
  });
});
