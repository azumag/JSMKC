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
        pairSetDifferenceCount: 0,
        byeAssignmentChangedPlayerCount: 0,
      }),
    );
    expect(comparison!.pairDayChangedCount).toBeGreaterThan(0);
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
        pairSetDifferenceCount: 0,
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
      expect(comparison.pairSetDifferenceCount).toBe(0);
      expect(comparison.pairDayChangedCount).toBeGreaterThan(0);
      expect(comparison.pairSideChangedCount).toBeGreaterThanOrEqual(0);
      expect(comparison.byeAssignmentChangedPlayerCount).toBeGreaterThanOrEqual(0);
    }
  });
});
