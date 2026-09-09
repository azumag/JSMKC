import { CDM_ROUND_ROBIN_FIXTURES, getCdmRoundRobinFixturePlan } from '@/lib/cdm-round-robin-fixtures';

export interface PlayerBreakDayPlan {
  playerSeed: number;
  breakDays: number[];
}

export interface UnsupportedCdmBreakPlacementOptimization {
  playerCount: number;
  fixtureCapacity: number;
  breakSlotCount: number;
  evaluatedPlacementCount: number;
  minimumPossibleMaxConsecutiveBreakDayCount: number;
  placementCountAtMinimumConsecutiveBreaks: number;
  maximumMinimumBreakOnlyDayGap: number;
  placementCountAtRecommendedScore: number;
  recommendedBreakSlotPositions: number[];
  recommendedBreakOnlyDays: number[];
  recommendedBreakDaysByPlayerSeed: PlayerBreakDayPlan[];
}

interface BreakPlacementScore {
  breakSlotPositions: number[];
  breakOnlyDays: number[];
  breakDaysByPlayerSeed: PlayerBreakDayPlan[];
  maxConsecutiveBreakDayCount: number;
  minimumBreakOnlyDayGap: number;
}

function getMaxConsecutiveDayCount(days: readonly number[]) {
  let maxCount = 0;
  let currentCount = 0;
  let previousDay: number | null = null;

  for (const day of days) {
    currentCount = previousDay !== null && day === previousDay + 1 ? currentCount + 1 : 1;
    maxCount = Math.max(maxCount, currentCount);
    previousDay = day;
  }

  return maxCount;
}

function getMinimumDayGap(days: readonly number[]) {
  if (days.length < 2) return 0;

  let minimumGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < days.length; index += 1) {
    minimumGap = Math.min(minimumGap, days[index] - days[index - 1]);
  }

  return minimumGap;
}

function buildCombinations(itemCount: number, selectedCount: number) {
  const combinations: number[][] = [];
  const current: number[] = [];

  function visit(start: number) {
    if (current.length === selectedCount) {
      combinations.push([...current]);
      return;
    }

    const remainingNeeded = selectedCount - current.length;
    for (let index = start; index <= itemCount - remainingNeeded; index += 1) {
      current.push(index);
      visit(index + 1);
      current.pop();
    }
  }

  visit(0);
  return combinations;
}

function compareNumberArrays(left: readonly number[], right: readonly number[]) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }

  return left.length - right.length;
}

function scoreBreakPlacement(
  fixture: readonly (readonly (readonly [number, number])[])[],
  playerCount: number,
  breakSlotIndexes: readonly number[],
): BreakPlacementScore {
  const breakSlots = new Set(breakSlotIndexes);
  const realSlotIndexes = Array.from({ length: playerCount + breakSlotIndexes.length }, (_, index) => index).filter(
    (index) => !breakSlots.has(index),
  );
  const playerSeedBySlot = new Map(realSlotIndexes.map((slotIndex, index) => [slotIndex, index + 1]));
  const breakDaysByPlayerSeed = realSlotIndexes.map((slotIndex, index) => ({
    playerSeed: index + 1,
    slotIndex,
    breakDays: [] as number[],
  }));
  const breakOnlyDays: number[] = [];

  for (const [dayIndex, dayPairs] of fixture.entries()) {
    const day = dayIndex + 1;
    let hasBreakOnlyMatch = false;

    for (const [player1Index, player2Index] of dayPairs) {
      const player1IsBreak = breakSlots.has(player1Index);
      const player2IsBreak = breakSlots.has(player2Index);

      if (player1IsBreak && player2IsBreak) {
        hasBreakOnlyMatch = true;
        continue;
      }
      if (player1IsBreak === player2IsBreak) continue;

      const realSlotIndex = player1IsBreak ? player2Index : player1Index;
      const playerSeed = playerSeedBySlot.get(realSlotIndex);
      if (playerSeed === undefined) continue;
      breakDaysByPlayerSeed[playerSeed - 1].breakDays.push(day);
    }

    if (hasBreakOnlyMatch) breakOnlyDays.push(day);
  }

  return {
    breakSlotPositions: breakSlotIndexes.map((index) => index + 1),
    breakOnlyDays,
    breakDaysByPlayerSeed: breakDaysByPlayerSeed.map(({ playerSeed, breakDays }) => ({ playerSeed, breakDays })),
    maxConsecutiveBreakDayCount: Math.max(
      ...breakDaysByPlayerSeed.map(({ breakDays }) => getMaxConsecutiveDayCount(breakDays)),
    ),
    minimumBreakOnlyDayGap: getMinimumDayGap(breakOnlyDays),
  };
}

/**
 * Explore BREAK-slot placement for the nearest larger raw RR 2025 fixture.
 *
 * This is a read-only decision aid for #3054. It deliberately does not extend
 * the production CDM generator mapping. Player seeds are assigned to the
 * remaining fixture slots in ascending order for each candidate placement.
 *
 * Recommendation order:
 * 1. minimize the worst consecutive BREAK-day streak for any player;
 * 2. maximize the minimum gap between days containing BREAK-vs-BREAK rows;
 * 3. use the lexicographically smallest 1-based BREAK-slot positions as a
 *    deterministic tie-breaker.
 */
export function optimizeUnsupportedCdmBreakPlacement(
  playerCount: number,
): UnsupportedCdmBreakPlacementOptimization | null {
  if (!Number.isInteger(playerCount) || playerCount <= 0) return null;
  if (getCdmRoundRobinFixturePlan(playerCount)) return null;

  const fixtureCapacity = Object.keys(CDM_ROUND_ROBIN_FIXTURES)
    .map(Number)
    .sort((left, right) => left - right)
    .find((capacity) => capacity > playerCount);
  if (fixtureCapacity === undefined) return null;

  const breakSlotCount = fixtureCapacity - playerCount;
  const fixture = CDM_ROUND_ROBIN_FIXTURES[fixtureCapacity];
  const placements = buildCombinations(fixtureCapacity, breakSlotCount).map((breakSlotIndexes) =>
    scoreBreakPlacement(fixture, playerCount, breakSlotIndexes),
  );
  if (placements.length === 0) return null;

  const minimumPossibleMaxConsecutiveBreakDayCount = Math.min(
    ...placements.map(({ maxConsecutiveBreakDayCount }) => maxConsecutiveBreakDayCount),
  );
  const minimumConsecutivePlacements = placements.filter(
    ({ maxConsecutiveBreakDayCount }) =>
      maxConsecutiveBreakDayCount === minimumPossibleMaxConsecutiveBreakDayCount,
  );
  const maximumMinimumBreakOnlyDayGap = Math.max(
    ...minimumConsecutivePlacements.map(({ minimumBreakOnlyDayGap }) => minimumBreakOnlyDayGap),
  );
  const recommendedScorePlacements = minimumConsecutivePlacements
    .filter(({ minimumBreakOnlyDayGap }) => minimumBreakOnlyDayGap === maximumMinimumBreakOnlyDayGap)
    .sort((left, right) => compareNumberArrays(left.breakSlotPositions, right.breakSlotPositions));
  const recommended = recommendedScorePlacements[0];

  return {
    playerCount,
    fixtureCapacity,
    breakSlotCount,
    evaluatedPlacementCount: placements.length,
    minimumPossibleMaxConsecutiveBreakDayCount,
    placementCountAtMinimumConsecutiveBreaks: minimumConsecutivePlacements.length,
    maximumMinimumBreakOnlyDayGap,
    placementCountAtRecommendedScore: recommendedScorePlacements.length,
    recommendedBreakSlotPositions: recommended.breakSlotPositions,
    recommendedBreakOnlyDays: recommended.breakOnlyDays,
    recommendedBreakDaysByPlayerSeed: recommended.breakDaysByPlayerSeed,
  };
}
