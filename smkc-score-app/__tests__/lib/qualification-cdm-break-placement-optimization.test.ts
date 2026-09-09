import { optimizeUnsupportedCdmBreakPlacement } from '@/lib/qualification-cdm-break-placement-optimization';

describe('optimizeUnsupportedCdmBreakPlacement', () => {
  it('finds a 13-player placement with no consecutive BREAK days', () => {
    expect(optimizeUnsupportedCdmBreakPlacement(13)).toEqual({
      playerCount: 13,
      fixtureCapacity: 16,
      breakSlotCount: 3,
      evaluatedPlacementCount: 560,
      minimumPossibleMaxConsecutiveBreakDayCount: 1,
      placementCountAtMinimumConsecutiveBreaks: 208,
      maximumMinimumBreakOnlyDayGap: 4,
      placementCountAtRecommendedScore: 48,
      recommendedBreakSlotPositions: [1, 5, 9],
      recommendedBreakOnlyDays: [4, 8, 12],
      recommendedBreakDaysByPlayerSeed: [
        { playerSeed: 1, breakDays: [7, 11, 15] },
        { playerSeed: 2, breakDays: [6, 10, 14] },
        { playerSeed: 3, breakDays: [5, 9, 13] },
        { playerSeed: 4, breakDays: [3, 11, 15] },
        { playerSeed: 5, breakDays: [2, 10, 14] },
        { playerSeed: 6, breakDays: [1, 9, 13] },
        { playerSeed: 7, breakDays: [3, 7, 15] },
        { playerSeed: 8, breakDays: [2, 6, 14] },
        { playerSeed: 9, breakDays: [1, 5, 13] },
        { playerSeed: 10, breakDays: [4, 8, 12] },
        { playerSeed: 11, breakDays: [3, 7, 11] },
        { playerSeed: 12, breakDays: [2, 6, 10] },
        { playerSeed: 13, breakDays: [1, 5, 9] },
      ],
    });
  });

  it('keeps all recommended player BREAK days non-consecutive and evenly counts three BREAKs', () => {
    const optimization = optimizeUnsupportedCdmBreakPlacement(13);

    expect(optimization).not.toBeNull();
    for (const player of optimization!.recommendedBreakDaysByPlayerSeed) {
      expect(player.breakDays).toHaveLength(3);
      for (let index = 1; index < player.breakDays.length; index += 1) {
        expect(player.breakDays[index] - player.breakDays[index - 1]).toBeGreaterThan(1);
      }
    }
  });

  it('returns null for already-supported, invalid, or fixture-exhausted player counts', () => {
    expect(optimizeUnsupportedCdmBreakPlacement(12)).toBeNull();
    expect(optimizeUnsupportedCdmBreakPlacement(14)).toBeNull();
    expect(optimizeUnsupportedCdmBreakPlacement(21)).toBeNull();
    expect(optimizeUnsupportedCdmBreakPlacement(0)).toBeNull();
    expect(optimizeUnsupportedCdmBreakPlacement(13.5)).toBeNull();
  });
});
