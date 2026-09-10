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
      remappedPlayerCount: 13,
      maximumPlayerSlotShift: 3,
      recommendedPlayerSlotAssignments: [
        { playerSeed: 1, fixtureSlotPosition: 2, slotShift: 1 },
        { playerSeed: 2, fixtureSlotPosition: 3, slotShift: 1 },
        { playerSeed: 3, fixtureSlotPosition: 4, slotShift: 1 },
        { playerSeed: 4, fixtureSlotPosition: 6, slotShift: 2 },
        { playerSeed: 5, fixtureSlotPosition: 7, slotShift: 2 },
        { playerSeed: 6, fixtureSlotPosition: 8, slotShift: 2 },
        { playerSeed: 7, fixtureSlotPosition: 10, slotShift: 3 },
        { playerSeed: 8, fixtureSlotPosition: 11, slotShift: 3 },
        { playerSeed: 9, fixtureSlotPosition: 12, slotShift: 3 },
        { playerSeed: 10, fixtureSlotPosition: 13, slotShift: 3 },
        { playerSeed: 11, fixtureSlotPosition: 14, slotShift: 3 },
        { playerSeed: 12, fixtureSlotPosition: 15, slotShift: 3 },
        { playerSeed: 13, fixtureSlotPosition: 16, slotShift: 3 },
      ],
      recommendedPlacementScheduleImpact: {
        realMatchCount: 78,
        pairSetDifferenceCount: 0,
        pairDayUnchangedCount: 6,
        pairDayChangedCount: 72,
        totalPairDayShift: 314,
        maxPairDayShift: 14,
        pairSideChangedCount: 34,
        pairDayAndSideUnchangedCount: 2,
      },
      leastDisruptiveFairPlacement: {
        breakSlotPositions: [8, 12, 16],
        playerSlotAssignments: [
          { playerSeed: 1, fixtureSlotPosition: 1, slotShift: 0 },
          { playerSeed: 2, fixtureSlotPosition: 2, slotShift: 0 },
          { playerSeed: 3, fixtureSlotPosition: 3, slotShift: 0 },
          { playerSeed: 4, fixtureSlotPosition: 4, slotShift: 0 },
          { playerSeed: 5, fixtureSlotPosition: 5, slotShift: 0 },
          { playerSeed: 6, fixtureSlotPosition: 6, slotShift: 0 },
          { playerSeed: 7, fixtureSlotPosition: 7, slotShift: 0 },
          { playerSeed: 8, fixtureSlotPosition: 9, slotShift: 1 },
          { playerSeed: 9, fixtureSlotPosition: 10, slotShift: 1 },
          { playerSeed: 10, fixtureSlotPosition: 11, slotShift: 1 },
          { playerSeed: 11, fixtureSlotPosition: 13, slotShift: 2 },
          { playerSeed: 12, fixtureSlotPosition: 14, slotShift: 2 },
          { playerSeed: 13, fixtureSlotPosition: 15, slotShift: 2 },
        ],
        remappedPlayerCount: 6,
        maximumPlayerSlotShift: 2,
        scheduleImpact: {
          realMatchCount: 78,
          pairSetDifferenceCount: 0,
          pairDayUnchangedCount: 22,
          pairDayChangedCount: 56,
          totalPairDayShift: 218,
          maxPairDayShift: 14,
          pairSideChangedCount: 27,
          pairDayAndSideUnchangedCount: 21,
        },
      },
      blockingDecisions: ['break-slot-placement', 'day-order-fidelity', 'side-orientation-fidelity'],
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

    const occupiedSlots = decision!.recommendedPlayerSlotAssignments.map(
      ({ fixtureSlotPosition }) => fixtureSlotPosition,
    );
    expect(occupiedSlots).toEqual([2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16]);
    expect(occupiedSlots).not.toEqual(expect.arrayContaining(decision!.recommendedBreakSlotPositions));
    expect(decision!.recommendedPlacementScheduleImpact.realMatchCount).toBe(decision!.candidateImpact.realMatchCount);
    expect(decision!.leastDisruptiveFairPlacement.scheduleImpact.pairDayChangedCount).toBeLessThan(
      decision!.recommendedPlacementScheduleImpact.pairDayChangedCount,
    );
    expect(decision!.leastDisruptiveFairPlacement.scheduleImpact.totalPairDayShift).toBeLessThan(
      decision!.recommendedPlacementScheduleImpact.totalPairDayShift,
    );
    expect(decision!.leastDisruptiveFairPlacement.remappedPlayerCount).toBeLessThan(decision!.remappedPlayerCount);
    expect(decision!.blockingDecisions).not.toContain('pair-set-fidelity');
  });

  it('returns null when there is no unsupported larger-fixture candidate', () => {
    expect(buildUnsupportedCdmFixtureCandidateDecision(12)).toBeNull();
    expect(buildUnsupportedCdmFixtureCandidateDecision(14)).toBeNull();
    expect(buildUnsupportedCdmFixtureCandidateDecision(21)).toBeNull();
    expect(buildUnsupportedCdmFixtureCandidateDecision(0)).toBeNull();
  });
});
