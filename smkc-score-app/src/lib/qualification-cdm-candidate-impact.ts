import { CDM_ROUND_ROBIN_FIXTURES, getCdmRoundRobinFixturePlan } from '@/lib/cdm-round-robin-fixtures';

export interface UnsupportedCdmFixtureCandidateImpact {
  playerCount: number;
  fixtureCapacity: number;
  breakSlotCount: number;
  totalDays: number;
  realMatchCount: number;
  playerBreakMatchCount: number;
  breakOnlyMatchCount: number;
  breakOnlyDays: number[];
  minBreaksPerPlayer: number;
  maxBreaksPerPlayer: number;
  maxConsecutiveBreakDayCount: number;
  maxConsecutiveBreakDayPlayerSeeds: number[];
  minPlayersOnBreakPerDay: number;
  maxPlayersOnBreakPerDay: number;
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

/**
 * Quantify the nearest larger raw RR 2025 fixture for a player count that the
 * current CDM generator mapping does not support.
 *
 * This is a read-only decision aid for #3054. It does not add a generator
 * mapping, alter qualification policy, or persist a schedule. Real players are
 * assumed to occupy the leading fixture slots, matching the existing CDM
 * generator convention; all remaining slots are treated as BREAK slots.
 */
export function analyzeUnsupportedCdmFixtureCandidate(
  playerCount: number,
): UnsupportedCdmFixtureCandidateImpact | null {
  if (!Number.isInteger(playerCount) || playerCount <= 0) return null;
  if (getCdmRoundRobinFixturePlan(playerCount)) return null;

  const fixtureCapacity = Object.keys(CDM_ROUND_ROBIN_FIXTURES)
    .map(Number)
    .sort((left, right) => left - right)
    .find((capacity) => capacity > playerCount);
  if (fixtureCapacity === undefined) return null;

  const fixture = CDM_ROUND_ROBIN_FIXTURES[fixtureCapacity];
  const breaksByPlayer = Array.from({ length: playerCount }, () => 0);
  const breakDaysByPlayer = Array.from({ length: playerCount }, () => [] as number[]);
  const playersOnBreakPerDay: number[] = [];
  const breakOnlyDays: number[] = [];
  let realMatchCount = 0;
  let playerBreakMatchCount = 0;
  let breakOnlyMatchCount = 0;

  for (const [dayIndex, dayPairs] of fixture.entries()) {
    const day = dayIndex + 1;
    let playersOnBreak = 0;
    let hasBreakOnlyMatch = false;

    for (const [player1Index, player2Index] of dayPairs) {
      const player1IsBreak = player1Index >= playerCount;
      const player2IsBreak = player2Index >= playerCount;

      if (!player1IsBreak && !player2IsBreak) {
        realMatchCount += 1;
        continue;
      }

      if (player1IsBreak && player2IsBreak) {
        breakOnlyMatchCount += 1;
        hasBreakOnlyMatch = true;
        continue;
      }

      const realPlayerIndex = player1IsBreak ? player2Index : player1Index;
      breaksByPlayer[realPlayerIndex] += 1;
      breakDaysByPlayer[realPlayerIndex].push(day);
      playerBreakMatchCount += 1;
      playersOnBreak += 1;
    }

    if (hasBreakOnlyMatch) breakOnlyDays.push(day);
    playersOnBreakPerDay.push(playersOnBreak);
  }

  const consecutiveBreakDayCounts = breakDaysByPlayer.map(getMaxConsecutiveDayCount);
  const maxConsecutiveBreakDayCount = Math.max(...consecutiveBreakDayCounts);
  const maxConsecutiveBreakDayPlayerSeeds = consecutiveBreakDayCounts.flatMap((count, index) =>
    count === maxConsecutiveBreakDayCount ? [index + 1] : [],
  );

  return {
    playerCount,
    fixtureCapacity,
    breakSlotCount: fixtureCapacity - playerCount,
    totalDays: fixture.length,
    realMatchCount,
    playerBreakMatchCount,
    breakOnlyMatchCount,
    breakOnlyDays,
    minBreaksPerPlayer: Math.min(...breaksByPlayer),
    maxBreaksPerPlayer: Math.max(...breaksByPlayer),
    maxConsecutiveBreakDayCount,
    maxConsecutiveBreakDayPlayerSeeds,
    minPlayersOnBreakPerDay: Math.min(...playersOnBreakPerDay),
    maxPlayersOnBreakPerDay: Math.max(...playersOnBreakPerDay),
  };
}
