import { CDM_ROUND_ROBIN_FIXTURES } from '@/lib/cdm-round-robin-fixtures';
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

export interface RecommendedPlacementScheduleImpact {
  realMatchCount: number;
  pairSetDifferenceCount: number;
  pairDayUnchangedCount: number;
  pairDayChangedCount: number;
  totalPairDayShift: number;
  maxPairDayShift: number;
  pairSideChangedCount: number;
  pairDayAndSideUnchangedCount: number;
}

export interface UnsupportedCdmFixtureCandidateDecision {
  playerCount: number;
  conventionalBreakSlotPositions: number[];
  recommendedBreakSlotPositions: number[];
  recommendedPlacementUsesLeadingPlayerConvention: boolean;
  recommendedPlayerSlotAssignments: RecommendedPlayerSlotAssignment[];
  remappedPlayerCount: number;
  maximumPlayerSlotShift: number;
  recommendedPlacementScheduleImpact: RecommendedPlacementScheduleImpact;
  candidateImpact: UnsupportedCdmFixtureCandidateImpact;
  breakPlacementOptimization: UnsupportedCdmBreakPlacementOptimization;
}

interface ComparableFixtureMatch {
  day: number;
  player1Seed: number;
  player2Seed: number;
}

function numberArraysEqual(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function pairKey(player1Seed: number, player2Seed: number) {
  return player1Seed < player2Seed ? `${player1Seed}:${player2Seed}` : `${player2Seed}:${player1Seed}`;
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

function buildRealFixtureMatchMap(
  playerCount: number,
  fixtureCapacity: number,
  breakSlotPositions: readonly number[],
) {
  const fixture = CDM_ROUND_ROBIN_FIXTURES[fixtureCapacity];
  if (!fixture) return null;

  const breakSlotIndexes = new Set(breakSlotPositions.map((position) => position - 1));
  const realSlotIndexes = Array.from({ length: fixtureCapacity }, (_, index) => index).filter(
    (slotIndex) => !breakSlotIndexes.has(slotIndex),
  );
  if (realSlotIndexes.length !== playerCount) return null;

  const playerSeedBySlotIndex = new Map(realSlotIndexes.map((slotIndex, index) => [slotIndex, index + 1]));
  const matches = new Map<string, ComparableFixtureMatch>();

  for (const [dayIndex, dayPairs] of fixture.entries()) {
    for (const [player1SlotIndex, player2SlotIndex] of dayPairs) {
      const player1Seed = playerSeedBySlotIndex.get(player1SlotIndex);
      const player2Seed = playerSeedBySlotIndex.get(player2SlotIndex);
      if (player1Seed === undefined || player2Seed === undefined) continue;

      const key = pairKey(player1Seed, player2Seed);
      if (matches.has(key)) return null;
      matches.set(key, {
        day: dayIndex + 1,
        player1Seed,
        player2Seed,
      });
    }
  }

  return matches;
}

function compareFixturePlacements(
  playerCount: number,
  fixtureCapacity: number,
  conventionalBreakSlotPositions: readonly number[],
  recommendedBreakSlotPositions: readonly number[],
): RecommendedPlacementScheduleImpact | null {
  const conventionalMatches = buildRealFixtureMatchMap(
    playerCount,
    fixtureCapacity,
    conventionalBreakSlotPositions,
  );
  const recommendedMatches = buildRealFixtureMatchMap(playerCount, fixtureCapacity, recommendedBreakSlotPositions);
  if (!conventionalMatches || !recommendedMatches) return null;

  const allPairKeys = new Set([...conventionalMatches.keys(), ...recommendedMatches.keys()]);
  let pairSetDifferenceCount = 0;
  let pairDayUnchangedCount = 0;
  let pairDayChangedCount = 0;
  let totalPairDayShift = 0;
  let maxPairDayShift = 0;
  let pairSideChangedCount = 0;
  let pairDayAndSideUnchangedCount = 0;

  for (const key of allPairKeys) {
    const conventionalMatch = conventionalMatches.get(key);
    const recommendedMatch = recommendedMatches.get(key);
    if (!conventionalMatch || !recommendedMatch) {
      pairSetDifferenceCount += 1;
      continue;
    }

    const sameDay = conventionalMatch.day === recommendedMatch.day;
    const sameSide = conventionalMatch.player1Seed === recommendedMatch.player1Seed;
    if (sameDay) {
      pairDayUnchangedCount += 1;
    } else {
      const dayShift = Math.abs(conventionalMatch.day - recommendedMatch.day);
      pairDayChangedCount += 1;
      totalPairDayShift += dayShift;
      maxPairDayShift = Math.max(maxPairDayShift, dayShift);
    }
    if (!sameSide) pairSideChangedCount += 1;
    if (sameDay && sameSide) pairDayAndSideUnchangedCount += 1;
  }

  return {
    realMatchCount: conventionalMatches.size,
    pairSetDifferenceCount,
    pairDayUnchangedCount,
    pairDayChangedCount,
    totalPairDayShift,
    maxPairDayShift,
    pairSideChangedCount,
    pairDayAndSideUnchangedCount,
  };
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
 * This helper also compares the two placements using the raw fixture so the
 * Day and 1P/2P churn implied by a fairness-oriented remap is visible before a
 * production scheduling decision is made.
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
  const recommendedPlacementScheduleImpact = compareFixturePlacements(
    playerCount,
    candidateImpact.fixtureCapacity,
    conventionalBreakSlotPositions,
    recommendedBreakSlotPositions,
  );
  if (!recommendedPlayerSlotAssignments || !recommendedPlacementScheduleImpact) return null;

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
    recommendedPlacementScheduleImpact,
    candidateImpact,
    breakPlacementOptimization,
  };
}
