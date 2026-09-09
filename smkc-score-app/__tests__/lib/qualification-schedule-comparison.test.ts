import {
  buildBalancedCdmSidePreviewSchedule,
  buildLegacyCircleCdmScheduleComparisons,
  compareCircleAndCdmQualificationSchedules,
} from '@/lib/qualification-schedule-comparison';
import { generateRoundRobinSchedule } from '@/lib/round-robin';

function pairKey(player1Id: string, player2Id: string) {
  return [player1Id, player2Id].sort().join(':');
}

describe('buildBalancedCdmSidePreviewSchedule', () => {
  it('keeps CDM Day/BREAK placement while taking circle 1P/2P orientation', () => {
    const playerIds = Array.from({ length: 7 }, (_, index) => `P${index + 1}`);
    const circle = generateRoundRobinSchedule(playerIds, { method: 'circle' });
    const cdm = generateRoundRobinSchedule(playerIds, { method: 'cdm' });
    const preview = buildBalancedCdmSidePreviewSchedule(playerIds);

    expect(preview).not.toBeNull();
    expect(preview!.totalDays).toBe(cdm.totalDays);
    expect(preview!.hasByes).toBe(cdm.hasByes);

    const circleMatches = new Map(
      circle.matches
        .filter((match) => !match.isBye)
        .map((match) => [pairKey(match.player1Id, match.player2Id), match] as const),
    );
    const cdmMatches = new Map(
      cdm.matches
        .filter((match) => !match.isBye)
        .map((match) => [pairKey(match.player1Id, match.player2Id), match] as const),
    );

    for (const match of preview!.matches.filter((candidate) => !candidate.isBye)) {
      const key = pairKey(match.player1Id, match.player2Id);
      expect(match.day).toBe(cdmMatches.get(key)?.day);
      expect(match.player1Id).toBe(circleMatches.get(key)?.player1Id);
      expect(match.player2Id).toBe(circleMatches.get(key)?.player2Id);
    }

    expect(preview!.matches.filter((match) => match.isBye)).toEqual(cdm.matches.filter((match) => match.isBye));
  });

  it('returns null when the requested player count has no CDM fixture', () => {
    const playerIds = Array.from({ length: 13 }, (_, index) => `P${index + 1}`);
    expect(buildBalancedCdmSidePreviewSchedule(playerIds)).toBeNull();
  });
});

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
        pairDayChangedCount: 15,
        totalPairDayShift: 36,
        maxPairDayShift: 5,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 14,
        maxPlayerTotalDayShiftSeedPositions: [3, 8],
        balancedCdmSidePlanAvailable: true,
        balancedCdmMaxSideImbalance: 1,
        balancedCdmExcessSideImbalancePlayerCount: 0,
        byeAssignmentChangedPlayerCount: 0,
        totalByeDayShift: 0,
        maxByeDayShift: 0,
      }),
    );
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
        pairDayChangedCount: 9,
        totalPairDayShift: 22,
        maxPairDayShift: 5,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 11,
        maxPlayerTotalDayShiftSeedPositions: [4],
        balancedCdmSidePlanAvailable: true,
        balancedCdmMaxSideImbalance: 0,
        balancedCdmExcessSideImbalancePlayerCount: 0,
        byeAssignmentChangedPlayerCount: 6,
        totalByeDayShift: 14,
        maxByeDayShift: 4,
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
      expect(comparison.totalPairDayShift).toBeGreaterThanOrEqual(comparison.pairDayChangedCount);
      expect(comparison.maxPairDayShift).toBeGreaterThan(0);
      expect(comparison.playerDayChangedCount).toBeGreaterThan(0);
      expect(comparison.playerDayChangedCount).toBeLessThanOrEqual(comparison.playerCount);
      expect(comparison.dayUnchangedSeedPositions.length).toBe(
        comparison.playerCount - comparison.playerDayChangedCount,
      );
      expect(comparison.maxPlayerTotalDayShift).toBeGreaterThanOrEqual(comparison.maxPairDayShift);
      expect(comparison.maxPlayerTotalDayShiftSeedPositions.length).toBeGreaterThan(0);
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
      expect(comparison.totalByeDayShift).not.toBeNull();
      expect(comparison.maxByeDayShift).not.toBeNull();
      expect(comparison.circleExcessSideImbalancePlayerCount).toBe(0);
    }
  });

  it('quantifies how far matching pairs move between circle and CDM days', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();

    expect(
      comparisons.map(({ playerCount, pairDayChangedCount, totalPairDayShift, maxPairDayShift }) => ({
        playerCount,
        pairDayChangedCount,
        totalPairDayShift,
        maxPairDayShift,
      })),
    ).toEqual([
      { playerCount: 7, pairDayChangedCount: 9, totalPairDayShift: 22, maxPairDayShift: 5 },
      { playerCount: 8, pairDayChangedCount: 15, totalPairDayShift: 36, maxPairDayShift: 5 },
      { playerCount: 9, pairDayChangedCount: 18, totalPairDayShift: 50, maxPairDayShift: 7 },
      { playerCount: 10, pairDayChangedCount: 25, totalPairDayShift: 74, maxPairDayShift: 7 },
      { playerCount: 11, pairDayChangedCount: 38, totalPairDayShift: 132, maxPairDayShift: 8 },
      { playerCount: 12, pairDayChangedCount: 47, totalPairDayShift: 174, maxPairDayShift: 8 },
    ]);
  });

  it('shows how aggregate Day movement is distributed across seed positions', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();

    expect(
      comparisons.map(
        ({
          playerCount,
          dayUnchangedSeedPositions,
          maxPlayerTotalDayShift,
          maxPlayerTotalDayShiftSeedPositions,
        }) => ({
          playerCount,
          dayUnchangedSeedPositions,
          maxPlayerTotalDayShift,
          maxPlayerTotalDayShiftSeedPositions,
        }),
      ),
    ).toEqual([
      {
        playerCount: 7,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 11,
        maxPlayerTotalDayShiftSeedPositions: [4],
      },
      {
        playerCount: 8,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 14,
        maxPlayerTotalDayShiftSeedPositions: [3, 8],
      },
      {
        playerCount: 9,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 18,
        maxPlayerTotalDayShiftSeedPositions: [6],
      },
      {
        playerCount: 10,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 24,
        maxPlayerTotalDayShiftSeedPositions: [6, 10],
      },
      {
        playerCount: 11,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 32,
        maxPlayerTotalDayShiftSeedPositions: [11],
      },
      {
        playerCount: 12,
        dayUnchangedSeedPositions: [1],
        maxPlayerTotalDayShift: 42,
        maxPlayerTotalDayShiftSeedPositions: [12],
      },
    ]);
  });

  it('quantifies how far odd-player BYE days move between circle and CDM', () => {
    const comparisons = buildLegacyCircleCdmScheduleComparisons();

    expect(
      comparisons.map(({ playerCount, byeAssignmentChangedPlayerCount, totalByeDayShift, maxByeDayShift }) => ({
        playerCount,
        byeAssignmentChangedPlayerCount,
        totalByeDayShift,
        maxByeDayShift,
      })),
    ).toEqual([
      { playerCount: 7, byeAssignmentChangedPlayerCount: 6, totalByeDayShift: 14, maxByeDayShift: 4 },
      { playerCount: 8, byeAssignmentChangedPlayerCount: 0, totalByeDayShift: 0, maxByeDayShift: 0 },
      { playerCount: 9, byeAssignmentChangedPlayerCount: 7, totalByeDayShift: 24, maxByeDayShift: 6 },
      { playerCount: 10, byeAssignmentChangedPlayerCount: 0, totalByeDayShift: 0, maxByeDayShift: 0 },
      { playerCount: 11, byeAssignmentChangedPlayerCount: 9, totalByeDayShift: 42, maxByeDayShift: 8 },
      { playerCount: 12, byeAssignmentChangedPlayerCount: 0, totalByeDayShift: 0, maxByeDayShift: 0 },
    ]);
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
