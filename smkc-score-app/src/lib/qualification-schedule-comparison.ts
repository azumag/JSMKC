import { getCdmRoundRobinFixturePlan } from '@/lib/cdm-round-robin-fixtures';
import { BREAK_PLAYER_ID, generateRoundRobinSchedule, type RoundRobinSchedule } from '@/lib/round-robin';

export const LEGACY_CIRCLE_CDM_COMPARISON_MIN_PLAYER_COUNT = 7;
export const LEGACY_CIRCLE_CDM_COMPARISON_MAX_PLAYER_COUNT = 13;

export interface QualificationScheduleComparison {
  playerCount: number;
  cdmFixtureCapacity: number;
  cdmBreakSlotCount: number;
  realMatchCount: number;
  circleTotalDays: number;
  cdmTotalDays: number;
  circleMaxSideImbalance: number;
  cdmMaxSideImbalance: number;
  circleExcessSideImbalancePlayerCount: number;
  cdmExcessSideImbalancePlayerCount: number;
  cdmExcessSideImbalanceSeedPositions: number[];
  pairSetDifferenceCount: number;
  pairDayChangedCount: number;
  totalPairDayShift: number;
  maxPairDayShift: number;
  playerDayChangedCount: number;
  dayUnchangedSeedPositions: number[];
  maxPlayerTotalDayShift: number;
  maxPlayerTotalDayShiftSeedPositions: number[];
  pairSideChangedCount: number;
  playerSideChangedCount: number;
  balancedCdmSidePlanAvailable: boolean;
  balancedCdmSideOverridePairCount: number | null;
  balancedCdmSideOverridePlayerCount: number | null;
  balancedCdmMaxSideImbalance: number | null;
  balancedCdmExcessSideImbalancePlayerCount: number | null;
  byeAssignmentChangedPlayerCount: number;
  totalByeDayShift: number | null;
  maxByeDayShift: number | null;
}

interface ComparableMatch {
  day: number;
  player1Id: string;
  player2Id: string;
}

interface SideImbalanceStats {
  max: number;
  excessPlayerCount: number;
  excessPlayerIds: string[];
}

interface DayShiftStats {
  total: number;
  max: number;
}

function pairKey(player1Id: string, player2Id: string) {
  return [player1Id, player2Id].sort().join('\u0000');
}

function buildRealMatchMap(schedule: RoundRobinSchedule) {
  const matches = new Map<string, ComparableMatch>();
  for (const match of schedule.matches) {
    if (match.isBye) continue;
    matches.set(pairKey(match.player1Id, match.player2Id), {
      day: match.day,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
    });
  }
  return matches;
}

function buildByeAssignments(schedule: RoundRobinSchedule, playerIds: string[]) {
  const daysByPlayer = new Map(playerIds.map((playerId) => [playerId, [] as number[]]));
  for (const match of schedule.matches) {
    if (!match.isBye) continue;
    const playerId = match.player1Id === BREAK_PLAYER_ID ? match.player2Id : match.player1Id;
    if (playerId === BREAK_PLAYER_ID) continue;
    daysByPlayer.get(playerId)?.push(match.day);
  }
  return daysByPlayer;
}

function getByeDayShiftStats(
  circleByes: Map<string, number[]>,
  cdmByes: Map<string, number[]>,
  playerIds: string[],
): DayShiftStats | null {
  let total = 0;
  let max = 0;

  for (const playerId of playerIds) {
    const circleDays = [...(circleByes.get(playerId) ?? [])].sort((left, right) => left - right);
    const cdmDays = [...(cdmByes.get(playerId) ?? [])].sort((left, right) => left - right);
    if (circleDays.length !== cdmDays.length) return null;

    for (let index = 0; index < circleDays.length; index += 1) {
      const shift = Math.abs(circleDays[index] - cdmDays[index]);
      total += shift;
      max = Math.max(max, shift);
    }
  }

  return { total, max };
}

function getRealMatchSideImbalanceStats(schedule: RoundRobinSchedule, playerIds: string[]): SideImbalanceStats {
  const sideBalances = new Map(playerIds.map((playerId) => [playerId, 0]));

  for (const match of schedule.matches) {
    if (match.isBye) continue;
    sideBalances.set(match.player1Id, (sideBalances.get(match.player1Id) ?? 0) + 1);
    sideBalances.set(match.player2Id, (sideBalances.get(match.player2Id) ?? 0) - 1);
  }

  const absoluteBalances = Array.from(sideBalances.values(), (balance) => Math.abs(balance));
  const unavoidableMinimum = playerIds.length % 2 === 0 ? 1 : 0;
  const excessPlayerIds = playerIds.filter(
    (playerId) => Math.abs(sideBalances.get(playerId) ?? 0) > unavoidableMinimum,
  );

  return {
    max: Math.max(0, ...absoluteBalances),
    excessPlayerCount: excessPlayerIds.length,
    excessPlayerIds,
  };
}

function sameNumberArray(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildBalancedCdmSidePreviewFromSchedules(
  circle: RoundRobinSchedule,
  cdm: RoundRobinSchedule,
): RoundRobinSchedule | null {
  const circleMatches = buildRealMatchMap(circle);
  const cdmMatches = buildRealMatchMap(cdm);
  if (circleMatches.size !== cdmMatches.size) return null;
  for (const key of circleMatches.keys()) {
    if (!cdmMatches.has(key)) return null;
  }

  return {
    totalDays: cdm.totalDays,
    hasByes: cdm.hasByes,
    matches: cdm.matches.map((match) => {
      if (match.isBye) return { ...match };
      const circleMatch = circleMatches.get(pairKey(match.player1Id, match.player2Id));
      if (!circleMatch) return { ...match };
      return {
        ...match,
        player1Id: circleMatch.player1Id,
        player2Id: circleMatch.player2Id,
      };
    }),
  };
}

/**
 * Build an in-memory hybrid preview that keeps the CDM fixture's Day/BREAK
 * placement while reusing the circle schedule's balanced 1P/2P orientation.
 * Nothing is persisted, and null means the two schedules do not share the same
 * real-match pair set (or the player count has no CDM fixture).
 */
export function buildBalancedCdmSidePreviewSchedule(playerIds: string[]): RoundRobinSchedule | null {
  if (!getCdmRoundRobinFixturePlan(playerIds.length)) return null;
  const circle = generateRoundRobinSchedule(playerIds, { method: 'circle' });
  const cdm = generateRoundRobinSchedule(playerIds, { method: 'cdm' });
  return buildBalancedCdmSidePreviewFromSchedules(circle, cdm);
}

/**
 * Compare the legacy circle schedule with the RR 2025 CDM fixture for one
 * player count without mutating tournament data. Seed order is held constant
 * so day, 1P/2P side balance, and BREAK assignment differences remain observable.
 */
export function compareCircleAndCdmQualificationSchedules(playerCount: number): QualificationScheduleComparison | null {
  const fixturePlan = getCdmRoundRobinFixturePlan(playerCount);
  if (!fixturePlan) return null;

  const playerIds = Array.from({ length: playerCount }, (_, index) => `P${index + 1}`);
  const circle = generateRoundRobinSchedule(playerIds, { method: 'circle' });
  const cdm = generateRoundRobinSchedule(playerIds, { method: 'cdm' });
  const circleMatches = buildRealMatchMap(circle);
  const cdmMatches = buildRealMatchMap(cdm);
  const circleSideImbalance = getRealMatchSideImbalanceStats(circle, playerIds);
  const cdmSideImbalance = getRealMatchSideImbalanceStats(cdm, playerIds);
  const cdmExcessSideImbalancePlayerIds = new Set(cdmSideImbalance.excessPlayerIds);
  const cdmExcessSideImbalanceSeedPositions = playerIds.flatMap((playerId, index) =>
    cdmExcessSideImbalancePlayerIds.has(playerId) ? [index + 1] : [],
  );
  const allPairKeys = new Set([...circleMatches.keys(), ...cdmMatches.keys()]);
  const playersWithDayChanges = new Set<string>();
  const playersWithSideChanges = new Set<string>();
  const totalDayShiftByPlayer = new Map(playerIds.map((playerId) => [playerId, 0]));

  let pairSetDifferenceCount = 0;
  let pairDayChangedCount = 0;
  let totalPairDayShift = 0;
  let maxPairDayShift = 0;
  let pairSideChangedCount = 0;
  for (const key of allPairKeys) {
    const circleMatch = circleMatches.get(key);
    const cdmMatch = cdmMatches.get(key);
    if (!circleMatch || !cdmMatch) {
      pairSetDifferenceCount += 1;
      continue;
    }
    if (circleMatch.day !== cdmMatch.day) {
      const dayShift = Math.abs(circleMatch.day - cdmMatch.day);
      pairDayChangedCount += 1;
      totalPairDayShift += dayShift;
      maxPairDayShift = Math.max(maxPairDayShift, dayShift);
      playersWithDayChanges.add(circleMatch.player1Id);
      playersWithDayChanges.add(circleMatch.player2Id);
      totalDayShiftByPlayer.set(
        circleMatch.player1Id,
        (totalDayShiftByPlayer.get(circleMatch.player1Id) ?? 0) + dayShift,
      );
      totalDayShiftByPlayer.set(
        circleMatch.player2Id,
        (totalDayShiftByPlayer.get(circleMatch.player2Id) ?? 0) + dayShift,
      );
    }
    if (circleMatch.player1Id !== cdmMatch.player1Id) {
      pairSideChangedCount += 1;
      playersWithSideChanges.add(circleMatch.player1Id);
      playersWithSideChanges.add(circleMatch.player2Id);
    }
  }

  const dayUnchangedSeedPositions = playerIds.flatMap((playerId, index) =>
    playersWithDayChanges.has(playerId) ? [] : [index + 1],
  );
  const maxPlayerTotalDayShift = Math.max(0, ...totalDayShiftByPlayer.values());
  const maxPlayerTotalDayShiftSeedPositions = playerIds.flatMap((playerId, index) =>
    totalDayShiftByPlayer.get(playerId) === maxPlayerTotalDayShift ? [index + 1] : [],
  );
  const balancedCdmSidePreview = buildBalancedCdmSidePreviewFromSchedules(circle, cdm);
  const balancedCdmSideImbalance = balancedCdmSidePreview
    ? getRealMatchSideImbalanceStats(balancedCdmSidePreview, playerIds)
    : null;
  const balancedCdmSidePlanAvailable = balancedCdmSidePreview !== null;
  const circleByes = buildByeAssignments(circle, playerIds);
  const cdmByes = buildByeAssignments(cdm, playerIds);
  const byeDayShift = getByeDayShiftStats(circleByes, cdmByes, playerIds);
  const byeAssignmentChangedPlayerCount = playerIds.filter(
    (playerId) => !sameNumberArray(circleByes.get(playerId) ?? [], cdmByes.get(playerId) ?? []),
  ).length;

  return {
    playerCount,
    cdmFixtureCapacity: fixturePlan.capacity,
    cdmBreakSlotCount: fixturePlan.breakSlotCount,
    realMatchCount: cdmMatches.size,
    circleTotalDays: circle.totalDays,
    cdmTotalDays: cdm.totalDays,
    circleMaxSideImbalance: circleSideImbalance.max,
    cdmMaxSideImbalance: cdmSideImbalance.max,
    circleExcessSideImbalancePlayerCount: circleSideImbalance.excessPlayerCount,
    cdmExcessSideImbalancePlayerCount: cdmSideImbalance.excessPlayerCount,
    cdmExcessSideImbalanceSeedPositions,
    pairSetDifferenceCount,
    pairDayChangedCount,
    totalPairDayShift,
    maxPairDayShift,
    playerDayChangedCount: playersWithDayChanges.size,
    dayUnchangedSeedPositions,
    maxPlayerTotalDayShift,
    maxPlayerTotalDayShiftSeedPositions,
    pairSideChangedCount,
    playerSideChangedCount: playersWithSideChanges.size,
    balancedCdmSidePlanAvailable,
    balancedCdmSideOverridePairCount: balancedCdmSidePlanAvailable ? pairSideChangedCount : null,
    balancedCdmSideOverridePlayerCount: balancedCdmSidePlanAvailable ? playersWithSideChanges.size : null,
    balancedCdmMaxSideImbalance: balancedCdmSideImbalance?.max ?? null,
    balancedCdmExcessSideImbalancePlayerCount: balancedCdmSideImbalance?.excessPlayerCount ?? null,
    byeAssignmentChangedPlayerCount,
    totalByeDayShift: byeDayShift?.total ?? null,
    maxByeDayShift: byeDayShift?.max ?? null,
  };
}

/**
 * Produce decision evidence for the current #3054 legacy-circle range. The
 * 13-player gap is intentionally omitted because no CDM fixture exists.
 */
export function buildLegacyCircleCdmScheduleComparisons(): QualificationScheduleComparison[] {
  const comparisons: QualificationScheduleComparison[] = [];
  for (
    let playerCount = LEGACY_CIRCLE_CDM_COMPARISON_MIN_PLAYER_COUNT;
    playerCount <= LEGACY_CIRCLE_CDM_COMPARISON_MAX_PLAYER_COUNT;
    playerCount += 1
  ) {
    const comparison = compareCircleAndCdmQualificationSchedules(playerCount);
    if (comparison) comparisons.push(comparison);
  }
  return comparisons;
}
