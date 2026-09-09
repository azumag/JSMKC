import {
  analyzeUnsupportedCdmFixtureCandidate,
  type UnsupportedCdmFixtureCandidateImpact,
} from '@/lib/qualification-cdm-candidate-impact';
import {
  optimizeUnsupportedCdmBreakPlacement,
  type UnsupportedCdmBreakPlacementOptimization,
} from '@/lib/qualification-cdm-break-placement-optimization';

export interface RecommendedPlayerSlotAssignment {
  playerSeed: number;
  fixtureSlotPosition: number;
  slotShift: number;
}

export interface UnsupportedCdmFixtureCandidateDecision {
  playerCount: number;
  conventionalBreakSlotPositions: number[];
  recommendedBreakSlotPositions: number[];
  recommendedPlacementUsesLeadingPlayerConvention: boolean;
  recommendedPlayerSlotAssignments: RecommendedPlayerSlotAssignment[];
  remappedPlayerCount: number;
  maximumPlayerSlotShift: number;
  candidateImpact: UnsupportedCdmFixtureCandidateImpact;
  breakPlacementOptimization: UnsupportedCdmBreakPlacementOptimization;
}

function numberArraysEqual(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildRecommendedPlayerSlotAssignments(
  playerCount: number,
  fixtureCapacity: number,
  breakSlotPositions: readonly number[],
) {
  const breakSlots = new Set(breakSlotPositions);
  const realSlotPositions = Array.from({ length: fixtureCapacity }, (_, index) => index + 1).filter(
    (slotPosition) => !breakSlots.has(slotPosition),
  );

  if (realSlotPositions.length !== playerCount) return null;

  return realSlotPositions.map((fixtureSlotPosition, index) => {
    const playerSeed = index + 1;
    return {
      playerSeed,
      fixtureSlotPosition,
      slotShift: fixtureSlotPosition - playerSeed,
    };
  });
}

/**
 * Consolidate the read-only evidence for an unsupported CDM fixture candidate.
 *
 * The existing generator convention fills real players into the leading slots,
 * which means any synthetic BREAK slots occupy the trailing fixture positions.
 * The optimizer is allowed to place BREAK slots anywhere. Surfacing both makes
 * it explicit when the fairness-improving recommendation would also require a
 * seed-to-fixture-slot policy decision rather than only a larger BREAK limit.
 *
 * This helper does not add a generator mapping, alter qualification policy, or
 * persist a schedule.
 */
export function buildUnsupportedCdmFixtureCandidateDecision(
  playerCount: number,
): UnsupportedCdmFixtureCandidateDecision | null {
  const candidateImpact = analyzeUnsupportedCdmFixtureCandidate(playerCount);
  const breakPlacementOptimization = optimizeUnsupportedCdmBreakPlacement(playerCount);
  if (!candidateImpact || !breakPlacementOptimization) return null;
  if (candidateImpact.fixtureCapacity !== breakPlacementOptimization.fixtureCapacity) return null;
  if (candidateImpact.breakSlotCount !== breakPlacementOptimization.breakSlotCount) return null;

  const conventionalBreakSlotPositions = Array.from(
    { length: candidateImpact.breakSlotCount },
    (_, index) => candidateImpact.playerCount + index + 1,
  );
  const recommendedBreakSlotPositions = breakPlacementOptimization.recommendedBreakSlotPositions;
  const recommendedPlayerSlotAssignments = buildRecommendedPlayerSlotAssignments(
    playerCount,
    candidateImpact.fixtureCapacity,
    recommendedBreakSlotPositions,
  );
  if (!recommendedPlayerSlotAssignments) return null;

  return {
    playerCount,
    conventionalBreakSlotPositions,
    recommendedBreakSlotPositions,
    recommendedPlacementUsesLeadingPlayerConvention: numberArraysEqual(
      conventionalBreakSlotPositions,
      recommendedBreakSlotPositions,
    ),
    recommendedPlayerSlotAssignments,
    remappedPlayerCount: recommendedPlayerSlotAssignments.filter(({ slotShift }) => slotShift !== 0).length,
    maximumPlayerSlotShift: Math.max(0, ...recommendedPlayerSlotAssignments.map(({ slotShift }) => slotShift)),
    candidateImpact,
    breakPlacementOptimization,
  };
}
