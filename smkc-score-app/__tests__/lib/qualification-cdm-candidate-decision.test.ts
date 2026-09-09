import { buildUnsupportedCdmFixtureCandidateDecision } from '@/lib/qualification-cdm-candidate-decision';

describe('buildUnsupportedCdmFixtureCandidateDecision', () => {
  it('makes the 13-player fairness recommendation and seed-slot trade-off explicit', () => {
    const decision = buildUnsupportedCdmFixtureCandidateDecision(13);

    expect(decision).not.toBeNull();
    expect(decision).toMatchObject({
      playerCount: 13,
      conventionalBreakSlotPositions: [14, 15, 16],
      recommendedBreakSlotPositions: [1, 5, 9],
      recommendedPlacementUsesLeadingPlayerConvention: false,
      candidateImpact: {
        playerCount: 13,
        fixtureCapacity: 16,
        breakSlotCount: 3,
        totalDays: 15,
        realMatchCount: 78,
        playerBreakMatchCount: 39,
        breakOnlyMatchCount: 3,
        breakOnlyDays: [13, 14, 15],
        maxConsecutiveBreakDayCount: 3,
      },
      breakPlacementOptimization: {
        playerCount: 13,
        fixtureCapacity: 16,
        breakSlotCount: 3,
        evaluatedPlacementCount: 560,
        minimumPossibleMaxConsecutiveBreakDayCount: 1,
        maximumMinimumPlayerBreakDayGap: 4,
        placementCountAtRecommendedScore: 16,
        recommendedBreakSlotPositions: [1, 5, 9],
        recommendedBreakOnlyDays: [4, 8, 12],
      },
    });
  });

  it('returns null when there is no unsupported larger-fixture candidate', () => {
    expect(buildUnsupportedCdmFixtureCandidateDecision(12)).toBeNull();
    expect(buildUnsupportedCdmFixtureCandidateDecision(14)).toBeNull();
    expect(buildUnsupportedCdmFixtureCandidateDecision(21)).toBeNull();
    expect(buildUnsupportedCdmFixtureCandidateDecision(0)).toBeNull();
  });
});
