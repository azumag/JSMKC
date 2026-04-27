/**
 * TA Finals Phase Manager
 *
 * Manages the three phases of TA (Time Attack) finals according to SMK tournament rules:
 *
 * Phase 1 (Losers Round 1):
 * - Participants: Qualification ranks 17-24 (8 players)
 * - Format: 1 course at a time, slowest player eliminated
 * - Continues until 4 players remain
 * - No life system
 *
 * Phase 2 (Losers Round 2):
 * - Participants: Phase 1 survivors (4) + Qualification ranks 13-16 (4) = 8 players
 * - Format: Same as Phase 1 (1 course, slowest eliminated)
 * - Continues until 4 players remain
 * - No life system
 *
 * Phase 3 (Finals):
 * - Participants: Phase 2 survivors (4) + Qualification ranks 1-12 (12) = 16 players
 * - Format: Life-based elimination
 * - Each course: bottom half loses 1 life
 * - Life reset at 8, 4, and 2 players remaining
 * - Last player standing wins
 *
 * Stage values:
 * - "qualification" -> "phase1" -> "phase2" -> "phase3"
 */

import { PrismaClient, TTEntry, Prisma } from "@prisma/client";
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import { selectRandomCourse, getPlayedCourses, getAvailableCourses, isValidCourseAbbr } from "@/lib/ta/course-selection";
import { RETRY_PENALTY_MS, CourseAbbr } from "@/lib/constants";

/**
 * Phase configuration constants defining the rules for each phase.
 * These values are derived from the official SMK tournament rulebook.
 */
export const PHASE_CONFIG = {
  // Phase 1: Losers Round 1 - Qualification ranks 17-24
  phase1: {
    qualRankStart: 17,
    qualRankEnd: 24,
    startingPlayers: 8,
    survivorsNeeded: 4,
    hasLives: false,
  },
  // Phase 2: Losers Round 2 - Phase 1 survivors + Qualification ranks 13-16
  phase2: {
    qualRankStart: 13,
    qualRankEnd: 16,
    startingPlayers: 8, // 4 from phase1 + 4 from qualification
    survivorsNeeded: 4,
    hasLives: false,
  },
  // Phase 3: Finals - Phase 2 survivors + Qualification ranks 1-12
  phase3: {
    qualRankStart: 1,
    qualRankEnd: 12,
    startingPlayers: 16, // 4 from phase2 + 12 from qualification
    survivorsNeeded: 1, // Last one standing wins
    hasLives: true,
    initialLives: 3,
    lifeResetThresholds: [8, 4, 2], // Reset lives when this many players remain
  },
} as const;

/**
 * Context for promotion/phase operations.
 * Contains user identity and request metadata for audit logging.
 */
export interface PhaseContext {
  tournamentId: string;
  /** undefined when called from a player session (no User FK) — audit row stores NULL */
  userId: string | undefined;
  ipAddress: string;
  userAgent: string;
}

/**
 * Result of a phase operation containing created entries,
 * skipped player names, and a descriptive message.
 */
export interface PhaseOperationResult {
  entries: TTEntry[];
  skipped: string[]; // Player nicknames that were skipped
  message: string;
}

/**
 * Course result for phase elimination processing.
 * Represents a single player's time on a specific course.
 */
export interface CourseResult {
  playerId: string;
  timeMs: number;
}

/**
 * Get players from qualification by rank range.
 * Used internally to fetch specific rank bands for phase promotions.
 *
 * @param prisma - Prisma client
 * @param tournamentId - Tournament ID
 * @param rankStart - Starting rank (inclusive)
 * @param rankEnd - Ending rank (inclusive)
 * @returns Array of TTEntry records ordered by rank ascending
 */
async function getQualificationPlayersByRank(
  prisma: PrismaClient,
  tournamentId: string,
  rankStart: number,
  rankEnd: number
): Promise<TTEntry[]> {
  return prisma.tTEntry.findMany({
    where: {
      tournamentId,
      stage: "qualification",
      rank: {
        gte: rankStart,
        lte: rankEnd,
      },
    },
    include: { player: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: { rank: "asc" },
  });
}

/**
 * Get non-eliminated players from a specific phase.
 * Used to determine surviving players for advancement or processing.
 *
 * @param prisma - Prisma client
 * @param tournamentId - Tournament ID
 * @param phase - Phase stage name (e.g., "phase1", "phase2", "phase3")
 * @returns Array of non-eliminated TTEntry records ordered by total time
 */
async function getActivePhasePlayers(
  prisma: PrismaClient,
  tournamentId: string,
  phase: string
): Promise<TTEntry[]> {
  return prisma.tTEntry.findMany({
    where: {
      tournamentId,
      stage: phase,
      eliminated: false,
    },
    include: { player: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: { totalTime: "asc" },
  });
}

/**
 * Promote players to Phase 1 (Losers Round 1).
 * Takes qualification ranks 17-24 and creates phase1 entries.
 *
 * Phase 1 entries carry forward qualification times and have no lives
 * (single elimination per course). Logger is created inside the function
 * to support proper test mocking.
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @returns Operation result with created entries and status message
 * @throws Error if no players found in the qualifying rank range
 */
export async function promoteToPhase1(
  prisma: PrismaClient,
  context: PhaseContext
): Promise<PhaseOperationResult> {
  // Logger created inside function (not module level) for proper test mocking
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;
  const config = PHASE_CONFIG.phase1;

  // Get qualification players ranked 17-24
  const qualifiers = await getQualificationPlayersByRank(
    prisma,
    tournamentId,
    config.qualRankStart,
    config.qualRankEnd
  );

  // If no players in ranks 17-24, Phase 1 is skipped (small tournament).
  // Return empty results instead of throwing to allow sequential phase advancement.
  if (qualifiers.length === 0) {
    return {
      entries: [],
      skipped: [],
      message: "Phase 1 skipped — no players in qualification ranks 17-24",
    };
  }

  const skippedPlayers: string[] = [];

  // Filter out players without total time first (incomplete qualification)
  const eligible = qualifiers.filter((qual) => {
    if (qual.totalTime === null) {
      const playerEntry = qual as TTEntry & { player: { nickname: string } };
      skippedPlayers.push(playerEntry.player.nickname);
      return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return { entries: [], skipped: skippedPlayers, message: "Phase 1 skipped — no eligible players with total time" };
  }

  // Bulk-check existing phase1 entries — collapses N findUnique calls into one D1 round-trip
  const playerIds = eligible.map((q) => q.playerId);
  const existingEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "phase1", playerId: { in: playerIds } },
    select: { playerId: true },
  });
  const existingIds = new Set(existingEntries.map((e) => e.playerId));

  const toCreate = eligible.filter((q) => !existingIds.has(q.playerId));
  if (toCreate.length === 0) {
    skippedPlayers.push(...playerIds.filter((id) => existingIds.has(id)));
    return { entries: [], skipped: skippedPlayers, message: "All players already promoted to Phase 1" };
  }

  // Batch-insert all new phase1 entries in one D1 round-trip (avoids N sequential creates
  // that previously caused ~3s latency and intermittent 500s on D1, issue #689)
  try {
    await prisma.tTEntry.createMany({
      data: toCreate.map((qual) => ({
        tournamentId,
        playerId: qual.playerId,
        stage: "phase1",
        lives: 0, // Phase1 uses direct elimination, not the life system
        eliminated: false,
        times: qual.times as Prisma.InputJsonValue,
        totalTime: qual.totalTime,
        rank: qual.rank,
      })),
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("P2002")) {
      // Concurrent request already created some entries — fetch below picks them up
      logger.warn("promoteToPhase1: P2002 on createMany, treating as idempotent");
    } else {
      throw e;
    }
  }

  // Fetch created entries with player data for the response and audit logs
  const createdEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "phase1", playerId: { in: toCreate.map((q) => q.playerId) } },
    include: { player: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: { rank: "asc" },
  });

  // Fire-and-forget audit logs — createAuditLog internally handles errors;
  // using void keeps them off the critical response path
  for (const entry of createdEntries) {
    void createAuditLog({
      userId,
      ipAddress,
      userAgent,
      action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
      targetId: entry.id,
      targetType: "TTEntry",
      details: {
        tournamentId,
        playerId: entry.playerId,
        playerNickname: (entry as TTEntry & { player: { nickname: string } }).player.nickname,
        promotedTo: "phase1",
      },
    });
  }

  return {
    entries: createdEntries,
    skipped: skippedPlayers,
    message: `Promoted ${createdEntries.length} players to Phase 1`,
  };
}

/**
 * Promote players to Phase 2 (Losers Round 2).
 * Takes Phase 1 survivors (non-eliminated) + qualification ranks 13-16.
 *
 * Creates an 8-player field combining:
 * - 4 survivors from Phase 1
 * - 4 players ranked 13-16 in qualification
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @returns Operation result with created entries and status message
 * @throws Error if no players available for Phase 2
 */
export async function promoteToPhase2(
  prisma: PrismaClient,
  context: PhaseContext
): Promise<PhaseOperationResult> {
  // Logger created inside function for proper test mocking
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;
  const config = PHASE_CONFIG.phase2;

  // Get Phase 1 survivors (non-eliminated players)
  const phase1Survivors = await getActivePhasePlayers(
    prisma,
    tournamentId,
    "phase1"
  );

  // Get qualification ranks 13-16
  const qualifiers = await getQualificationPlayersByRank(
    prisma,
    tournamentId,
    config.qualRankStart,
    config.qualRankEnd
  );

  // Combine both groups into the phase 2 candidate pool
  const allPlayers = [...phase1Survivors, ...qualifiers];

  // If no players available (no Phase 1 survivors and no ranks 13-16),
  // Phase 2 is skipped. Return empty results for small tournaments.
  if (allPlayers.length === 0) {
    return {
      entries: [],
      skipped: [],
      message: "Phase 2 skipped — no Phase 1 survivors and no players in ranks 13-16",
    };
  }

  const skippedPlayers: string[] = [];

  // Filter out players without total time
  const eligible = allPlayers.filter((source) => {
    if (source.totalTime === null) {
      const playerEntry = source as TTEntry & { player: { nickname: string } };
      skippedPlayers.push(playerEntry.player.nickname);
      return false;
    }
    return true;
  });

  // Bulk-check existing phase2 entries — collapses N findUnique calls into one D1 round-trip
  const playerIds = eligible.map((s) => s.playerId);
  const existingEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "phase2", playerId: { in: playerIds } },
    select: { playerId: true },
  });
  const existingIds = new Set(existingEntries.map((e) => e.playerId));

  const toCreate = eligible.filter((s) => !existingIds.has(s.playerId));
  if (toCreate.length === 0) {
    return { entries: [], skipped: skippedPlayers, message: "All players already promoted to Phase 2" };
  }

  // Batch-insert all new phase2 entries in one D1 round-trip (#689)
  try {
    await prisma.tTEntry.createMany({
      data: toCreate.map((source) => ({
        tournamentId,
        playerId: source.playerId,
        stage: "phase2",
        lives: 0,
        eliminated: false,
        times: source.times as Prisma.InputJsonValue,
        totalTime: source.totalTime,
        rank: source.rank,
      })),
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("P2002")) {
      logger.warn("promoteToPhase2: P2002 on createMany, treating as idempotent");
    } else {
      throw e;
    }
  }

  const createdEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "phase2", playerId: { in: toCreate.map((s) => s.playerId) } },
    include: { player: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: { rank: "asc" },
  });

  for (const entry of createdEntries) {
    void createAuditLog({
      userId, ipAddress, userAgent,
      action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
      targetId: entry.id,
      targetType: "TTEntry",
      details: { tournamentId, playerId: entry.playerId,
        playerNickname: (entry as TTEntry & { player: { nickname: string } }).player.nickname,
        promotedTo: "phase2" },
    });
  }

  return {
    entries: createdEntries,
    skipped: skippedPlayers,
    message: `Promoted ${createdEntries.length} players to Phase 2`,
  };
}

/**
 * Promote players to Phase 3 (Finals).
 * Takes Phase 2 survivors + qualification ranks 1-12.
 *
 * Creates up to a 16-player finals field:
 * - 4 survivors from Phase 2
 * - 12 top-ranked qualification players
 *
 * Finals entries start with 3 lives (life-based elimination system).
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @returns Operation result with created entries and status message
 * @throws Error if no players available for Phase 3
 */
export async function promoteToPhase3(
  prisma: PrismaClient,
  context: PhaseContext
): Promise<PhaseOperationResult> {
  // Logger created inside function for proper test mocking
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;
  const config = PHASE_CONFIG.phase3;

  // Get Phase 2 survivors (non-eliminated)
  const phase2Survivors = await getActivePhasePlayers(
    prisma,
    tournamentId,
    "phase2"
  );

  // Get qualification ranks 1-12 (top performers)
  const qualifiers = await getQualificationPlayersByRank(
    prisma,
    tournamentId,
    config.qualRankStart,
    config.qualRankEnd
  );

  // Combine both groups into the finals candidate pool
  const allPlayers = [...phase2Survivors, ...qualifiers];

  // Unlike Phase 1/2 (which return empty results when skipped for small tournaments),
  // Phase 3 with 0 players is always an error: there must be at least some players
  // in ranks 1-12 for a valid finals. This throw is intentional.
  if (allPlayers.length === 0) {
    throw new Error("No players available for Phase 3 (Finals)");
  }

  const skippedPlayers: string[] = [];

  // Filter out players without total time
  const eligible = allPlayers.filter((source) => {
    if (source.totalTime === null) {
      const playerEntry = source as TTEntry & { player: { nickname: string } };
      skippedPlayers.push(playerEntry.player.nickname);
      return false;
    }
    return true;
  });

  // Bulk-check existing phase3 entries — collapses N findUnique calls into one D1 round-trip
  const playerIds = eligible.map((s) => s.playerId);
  const existingEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "phase3", playerId: { in: playerIds } },
    select: { playerId: true },
  });
  const existingIds = new Set(existingEntries.map((e) => e.playerId));

  const toCreate = eligible.filter((s) => !existingIds.has(s.playerId));
  if (toCreate.length === 0) {
    return { entries: [], skipped: skippedPlayers, message: "All players already promoted to Phase 3" };
  }

  // Batch-insert all new phase3 entries in one D1 round-trip (#689)
  try {
    await prisma.tTEntry.createMany({
      data: toCreate.map((source) => ({
        tournamentId,
        playerId: source.playerId,
        stage: "phase3",
        lives: config.initialLives,
        eliminated: false,
        times: source.times as Prisma.InputJsonValue,
        totalTime: source.totalTime,
        rank: source.rank,
      })),
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("P2002")) {
      logger.warn("promoteToPhase3: P2002 on createMany, treating as idempotent");
    } else {
      throw e;
    }
  }

  const createdEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "phase3", playerId: { in: toCreate.map((s) => s.playerId) } },
    include: { player: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: { rank: "asc" },
  });

  for (const entry of createdEntries) {
    void createAuditLog({
      userId, ipAddress, userAgent,
      action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
      targetId: entry.id,
      targetType: "TTEntry",
      details: { tournamentId, playerId: entry.playerId,
        playerNickname: (entry as TTEntry & { player: { nickname: string } }).player.nickname,
        promotedTo: "phase3", initialLives: config.initialLives },
    });
  }

  return {
    entries: createdEntries,
    skipped: skippedPlayers,
    message: `Promoted ${createdEntries.length} players to Phase 3 (Finals) with ${config.initialLives} lives`,
  };
}

/**
 * Process Phase 1 or Phase 2 course result.
 * Eliminates the slowest player from the round.
 *
 * In phase1/phase2, elimination is simple: after each course,
 * the player with the slowest time is eliminated. This continues
 * until only the required number of survivors remain.
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @param phase - "phase1" or "phase2" to process
 * @param courseResults - Array of player time results for the current course
 * @returns Array of eliminated player IDs (usually just one)
 */
export async function processEliminationPhaseResult(
  prisma: PrismaClient,
  context: PhaseContext,
  phase: "phase1" | "phase2",
  courseResults: CourseResult[]
): Promise<string[]> {
  // Logger created inside function for proper test mocking
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;
  const config = PHASE_CONFIG[phase];

  // Get current active (non-eliminated) players in this phase
  const activePlayers = await getActivePhasePlayers(
    prisma,
    tournamentId,
    phase
  );

  // If already at or below survivor count, no elimination needed
  if (activePlayers.length <= config.survivorsNeeded) {
    return [];
  }

  // Sort results by time descending (slowest first) to find elimination target
  const sortedResults = [...courseResults].sort((a, b) => b.timeMs - a.timeMs);

  // Guard against tied slowest times: if multiple players share the worst time,
  // elimination is ambiguous and requires admin manual resolution.
  const slowestPlayer = sortedResults[0];
  const tiedCount = sortedResults.filter(r => r.timeMs === slowestPlayer.timeMs).length;
  if (tiedCount > 1) {
    throw new Error(
      `Tie detected: ${tiedCount} players share the slowest time (${slowestPlayer.timeMs}ms). Admin must resolve the tie manually before continuing.`
    );
  }

  await prisma.tTEntry.update({
    where: {
      tournamentId_playerId_stage: {
        tournamentId,
        playerId: slowestPlayer.playerId,
        stage: phase,
      },
    },
    data: { eliminated: true },
  });

  // Audit log for elimination event (non-critical)
  try {
    void createAuditLog({
      userId,
      ipAddress,
      userAgent,
      action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
      targetId: slowestPlayer.playerId,
      targetType: "TTEntry",
      details: {
        tournamentId,
        phase,
        action: "eliminated",
        reason: "slowest_time",
        timeMs: slowestPlayer.timeMs,
      },
    });
  } catch (logError) {
    logger.error("Failed to create audit log", {
      error: logError instanceof Error ? logError.message : logError,
    });
  }

  return [slowestPlayer.playerId];
}

/**
 * Process Phase 3 (Finals) course result.
 * Bottom half of players loses 1 life; players reaching 0 lives are eliminated.
 * Lives are reset when player count reaches threshold values (8, 4, 2).
 *
 * The finals elimination process per course:
 * 1. Sort all active players by their course time (fastest first)
 * 2. The bottom half (slower players) each lose 1 life
 * 3. Players with 0 lives are eliminated
 * 4. If remaining player count matches a reset threshold, all lives reset to 3
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @param courseResults - Array of player time results for the current course
 * @returns Object with eliminated player IDs and whether lives were reset
 */
export async function processPhase3Result(
  prisma: PrismaClient,
  context: PhaseContext,
  courseResults: CourseResult[]
): Promise<{ eliminated: string[]; livesReset: boolean }> {
  // Logger created inside function for proper test mocking
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;
  const config = PHASE_CONFIG.phase3;

  // Get current active players in phase 3
  const activePlayers = await getActivePhasePlayers(
    prisma,
    tournamentId,
    "phase3"
  );

  // Only 1 player left = winner, no more processing needed
  if (activePlayers.length <= 1) {
    return { eliminated: [], livesReset: false };
  }

  // Sort results by time ascending (fastest first)
  const sortedResults = [...courseResults].sort((a, b) => a.timeMs - b.timeMs);

  // Bottom half loses a life (players with slower times)
  // If odd number of players, the extra player is in the "safe" top half
  const halfwayPoint = Math.ceil(sortedResults.length / 2);
  const bottomHalf = sortedResults.slice(halfwayPoint);

  const eliminatedPlayers: string[] = [];

  for (const result of bottomHalf) {
    // Fetch current entry to get current lives count
    const entry = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: result.playerId,
          stage: "phase3",
        },
      },
    });

    if (entry && !entry.eliminated) {
      const newLives = entry.lives - 1;
      const isEliminated = newLives <= 0;

      // Update lives and elimination status
      await prisma.tTEntry.update({
        where: { id: entry.id },
        data: {
          lives: Math.max(0, newLives),
          eliminated: isEliminated,
        },
      });

      if (isEliminated) {
        eliminatedPlayers.push(result.playerId);
      }

      // Audit log for life loss / elimination (non-critical)
      try {
        void createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            phase: "phase3",
            action: isEliminated ? "eliminated" : "life_lost",
            oldLives: entry.lives,
            newLives: Math.max(0, newLives),
            timeMs: result.timeMs,
          },
        });
      } catch (logError) {
        logger.error("Failed to create audit log", {
          error: logError instanceof Error ? logError.message : logError,
        });
      }
    }
  }

  // Check if remaining player count matches a life reset threshold.
  // CRITICAL: Only trigger life reset when someone was actually eliminated this round
  // AND the new count hits a threshold. Without the eliminatedPlayers.length > 0 guard,
  // an infinite loop occurs: e.g. 8 players remain, bottom 4 lose a life (3→2),
  // no eliminations, remaining=8, lives reset to 3, repeat forever.
  const remainingPlayers = await getActivePhasePlayers(
    prisma,
    tournamentId,
    "phase3"
  );
  const remainingCount = remainingPlayers.length;

  let livesReset = false;
  // Only reset when a threshold is freshly reached (i.e., eliminations happened this round)
  if (
    eliminatedPlayers.length > 0 &&
    (config.lifeResetThresholds as readonly number[]).includes(remainingCount)
  ) {
    // Reset all remaining players to initial lives (3)
    await prisma.tTEntry.updateMany({
      where: {
        tournamentId,
        stage: "phase3",
        eliminated: false,
      },
      data: {
        lives: config.initialLives,
      },
    });
    livesReset = true;

    // Audit log for life reset event (non-critical)
    try {
      void createAuditLog({
        userId,
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
        targetId: tournamentId,
        targetType: "Tournament",
        details: {
          tournamentId,
          phase: "phase3",
          action: "lives_reset",
          playerCount: remainingCount,
          newLives: config.initialLives,
        },
      });
    } catch (logError) {
      logger.error("Failed to create audit log", {
        error: logError instanceof Error ? logError.message : logError,
      });
    }
  }

  return { eliminated: eliminatedPlayers, livesReset };
}

/**
 * Get the current phase status for a tournament.
 *
 * Returns a summary of all phases including player counts,
 * active/eliminated counts, and the current active phase.
 * For phase3, also returns the winner's nickname if determined.
 *
 * @param prisma - Prisma client
 * @param tournamentId - Tournament ID
 * @returns Phase status information with current phase indicator
 */
export async function getPhaseStatus(
  prisma: PrismaClient,
  tournamentId: string
): Promise<{
  phase1: { total: number; active: number; eliminated: number } | null;
  phase2: { total: number; active: number; eliminated: number } | null;
  phase3: { total: number; active: number; eliminated: number; winner: string | null } | null;
  currentPhase: string;
}> {
  /* Previously this ran 3 sequential findMany with full player includes.
   * Each D1 round-trip is ~150–250 ms; 3 sequential = 450–750 ms, pushing the
   * GET handler past the Workers wall-time budget (#733).
   *
   * Fix: run all three queries in parallel and use minimal selects.
   * Phases 1 & 2 only need `eliminated` (no player join).
   * Phase 3 additionally needs the winner's nickname when exactly 1 player is active.
   */
  const [phase1Entries, phase2Entries, phase3Entries] = await Promise.all([
    prisma.tTEntry.findMany({
      where: { tournamentId, stage: "phase1" },
      select: { eliminated: true },
    }),
    prisma.tTEntry.findMany({
      where: { tournamentId, stage: "phase2" },
      select: { eliminated: true },
    }),
    prisma.tTEntry.findMany({
      where: { tournamentId, stage: "phase3" },
      select: { eliminated: true, player: { select: { nickname: true } } },
    }),
  ]);

  const buildBase = (entries: { eliminated: boolean }[]) => {
    if (entries.length === 0) return null;
    const active = entries.filter((e) => !e.eliminated).length;
    return { total: entries.length, active, eliminated: entries.length - active };
  };

  const phase3Base = buildBase(phase3Entries);
  type Phase3Entry = { eliminated: boolean; player: { nickname: string } };
  const phase3Winner =
    phase3Base?.active === 1
      ? (phase3Entries.find((e) => !e.eliminated) as Phase3Entry | undefined)?.player.nickname ?? null
      : null;
  const phase3Status = phase3Base ? { ...phase3Base, winner: phase3Winner } : null;

  const currentPhase =
    phase3Entries.length > 0
      ? "phase3"
      : phase2Entries.length > 0
        ? "phase2"
        : phase1Entries.length > 0
          ? "phase1"
          : "qualification";

  return {
    phase1: buildBase(phase1Entries),
    phase2: buildBase(phase2Entries),
    phase3: phase3Status,
    currentPhase,
  };
}

/**
 * Result submitted for a single player in a round.
 * The isRetry flag triggers automatic penalty time override.
 */
export interface RoundResultInput {
  playerId: string;
  timeMs: number;
  isRetry?: boolean;
}

/**
 * Start a new round for a phase.
 *
 * Selects a random course from the unused pool (20-course cycle per phase),
 * creates a TTPhaseRound record with an empty results array,
 * and returns the round number and selected course.
 *
 * The round number is auto-incremented based on existing rounds in the phase.
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info for audit logging
 * @param phase - "phase1", "phase2", or "phase3"
 * @param manualCourse - Optional admin-specified course abbreviation. When provided,
 *   bypasses random selection. Must be a valid CourseAbbr in the current cycle's
 *   available pool. When omitted, a random course is chosen automatically.
 * @returns Object with roundNumber, course abbreviation, and manualOverride flag
 * @throws Error if phase has no active players (phase not yet started)
 * @throws Error if manualCourse is not a valid CourseAbbr
 * @throws Error if manualCourse has already been played in the current 20-course cycle
 */
export async function startPhaseRound(
  prisma: PrismaClient,
  context: PhaseContext,
  phase: "phase1" | "phase2" | "phase3",
  manualCourse?: string,
  tvNumber?: number | null
): Promise<{ roundNumber: number; course: string; manualOverride: boolean; tvNumber: number | null }> {
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;

  // Verify the phase has active players (pre-transaction guard)
  const activePlayers = await getActivePhasePlayers(
    prisma,
    tournamentId,
    phase
  );
  if (activePlayers.length === 0) {
    throw new Error(`No active players in ${phase}. Promote players first.`);
  }

  // Retry loop for round creation: handles the race condition where two concurrent
  // requests compute the same roundNumber. The @@unique([tournamentId, phase, roundNumber])
  // constraint causes one to fail with P2002, which we catch and retry.
  const MAX_ROUND_CREATE_ATTEMPTS = 3;
  let roundNumber = 0;
  let course = "";
  let manualOverride = false;

  for (let attempt = 1; attempt <= MAX_ROUND_CREATE_ATTEMPTS; attempt++) {
    // Compute roundNumber fresh on each attempt to handle concurrent requests.
    const existingRounds = await prisma.tTPhaseRound.count({
      where: { tournamentId, phase },
    });
    roundNumber = existingRounds + 1;

    // Determine the course to use: admin-specified manual override or random selection.
    // Manual course must be validated against the 20-course cycle to ensure fairness.
    // For random selection, pick a fresh course each retry attempt.
    if (manualCourse !== undefined && manualCourse !== "") {
      // Validate the abbreviation is a known course (only on first attempt)
      if (attempt === 1 && !isValidCourseAbbr(manualCourse)) {
        throw new Error(
          `Invalid course abbreviation: "${manualCourse}". Must be one of the 20 standard courses.`
        );
      }
      // Validate the course is still available in the current cycle
      // (not already played in the current 20-course block)
      const playedCourses = await getPlayedCourses(prisma, tournamentId, phase);
      const available = getAvailableCourses(playedCourses);
      if (!available.includes(manualCourse as CourseAbbr)) {
        throw new Error(
          `Course "${manualCourse}" has already been played in the current cycle. ` +
            `Available courses: ${available.join(", ")}`
        );
      }
      course = manualCourse as CourseAbbr;
      manualOverride = true;
    } else {
      // Default: select a random course from the unused pool for this phase.
      // Re-select on each retry attempt since playedCourses changes with each race.
      course = await selectRandomCourse(prisma, tournamentId, phase);
      manualOverride = false;
    }

    try {
      // Create the round record with empty results (to be filled on submitRoundResults).
      await prisma.tTPhaseRound.create({
        data: {
          tournamentId,
          phase,
          roundNumber,
          course,
          manualOverride,
          tvNumber: tvNumber ?? null,
          results: [], // Will be populated by submitRoundResults
        },
      });
      // Success — exit the retry loop
      break;
    } catch (error) {
      // P2002 = unique constraint violation = another request created this round first.
      // Log and retry with the next roundNumber.
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (isUniqueViolation && attempt < MAX_ROUND_CREATE_ATTEMPTS) {
        logger.warn("Round creation race condition detected, retrying", {
          tournamentId,
          phase,
          attempt,
          roundNumber,
        });
        // Retry with next iteration
        continue;
      }
      // Final attempt failed or non-retryable error — propagate
      throw error;
    }
  }

  // Audit log for round start (non-critical, outside transaction)
  try {
    void createAuditLog({
      userId,
      ipAddress,
      userAgent,
      action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
      targetId: tournamentId,
      targetType: "Tournament",
      details: {
        tournamentId,
        phase,
        action: "start_round",
        roundNumber,
        course,
        manualOverride,
        activePlayers: activePlayers.length,
      },
    });
  } catch (logError) {
    logger.error("Failed to create audit log for round start", {
      error: logError instanceof Error ? logError.message : logError,
    });
  }

  return { roundNumber, course, manualOverride, tvNumber: tvNumber ?? null };
}

/**
 * Submit results for a phase round and trigger elimination processing.
 *
 * This function:
 * 1. Validates the round exists and has not been submitted yet
 * 2. Applies retry penalty (9:59.990) for players who flagged isRetry
 * 3. Delegates elimination to processEliminationPhaseResult (phase1/2)
 *    or processPhase3Result (phase3)
 * 4. Updates the TTPhaseRound record with final results, eliminated IDs, and life reset flag
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @param phase - "phase1", "phase2", or "phase3"
 * @param roundNumber - The round number to submit results for
 * @param results - Array of player results with optional retry flag
 * @returns Object with eliminated player IDs, whether lives were reset, and the course
 */
export async function submitRoundResults(
  prisma: PrismaClient,
  context: PhaseContext,
  phase: "phase1" | "phase2" | "phase3",
  roundNumber: number,
  results: RoundResultInput[]
): Promise<{ eliminatedIds: string[]; livesReset: boolean; course: string }> {
  const logger = createLogger("ta-phase-manager");
  const { tournamentId } = context;

  // Fetch the round record to get the course and verify it exists
  const round = await prisma.tTPhaseRound.findUnique({
    where: {
      tournamentId_phase_roundNumber: {
        tournamentId,
        phase,
        roundNumber,
      },
    },
  });

  if (!round) {
    throw new Error(
      `Round ${roundNumber} not found for ${phase} in tournament ${tournamentId}`
    );
  }

  // Check if results have already been submitted (non-empty results array)
  const existingResults = round.results as unknown[];
  if (existingResults && existingResults.length > 0) {
    throw new Error(
      `Round ${roundNumber} of ${phase} has already been submitted`
    );
  }

  // === Player ID Validation ===
  // Ensures data integrity by verifying:
  // 1. No duplicate player IDs in submitted results
  // 2. All submitted IDs belong to active (non-eliminated) players in this phase
  // 3. All active players have submitted results (no missing players)
  const submittedIds = results.map((r) => r.playerId);
  const uniqueIds = new Set(submittedIds);

  // Check for duplicate player IDs in the submission
  if (uniqueIds.size !== submittedIds.length) {
    const duplicates = submittedIds.filter(
      (id, i) => submittedIds.indexOf(id) !== i
    );
    throw new Error(
      `Duplicate player IDs in results: ${[...new Set(duplicates)].join(", ")}`
    );
  }

  // Fetch active players for validation against the phase roster
  const activePlayers = await getActivePhasePlayers(
    prisma,
    tournamentId,
    phase
  );
  const activePlayerIds = new Set(activePlayers.map((p) => p.playerId));

  // Verify every submitted player ID belongs to an active player in this phase
  const invalidIds = submittedIds.filter((id) => !activePlayerIds.has(id));
  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid player IDs (not active in ${phase}): ${invalidIds.join(", ")}`
    );
  }

  // Verify all active players have results — prevents partial submissions
  // that could corrupt elimination logic
  const missingIds = [...activePlayerIds].filter((id) => !uniqueIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `Missing results for active players: ${missingIds.join(", ")}`
    );
  }

  // Apply retry penalty: override timeMs with RETRY_PENALTY_MS for retry-flagged results.
  // This ensures retrying players always receive the maximum penalty time (9:59.990).
  const processedResults: CourseResult[] = results.map((r) => ({
    playerId: r.playerId,
    timeMs: r.isRetry ? RETRY_PENALTY_MS : r.timeMs,
  }));

  // Store the full results including retry flags for display/audit purposes
  const storedResults = results.map((r) => ({
    playerId: r.playerId,
    timeMs: r.isRetry ? RETRY_PENALTY_MS : r.timeMs,
    isRetry: r.isRetry ?? false,
  }));

  let eliminatedIds: string[] = [];
  let livesReset = false;

  // Delegate elimination processing to the appropriate handler.
  // Phase 1/2: Slowest player is eliminated (single elimination).
  // Phase 3: Bottom half loses a life, eliminated at 0 lives, life resets at thresholds.
  if (phase === "phase1" || phase === "phase2") {
    eliminatedIds = await processEliminationPhaseResult(
      prisma,
      context,
      phase,
      processedResults
    );
  } else {
    // phase3 — life-based elimination
    const phase3Result = await processPhase3Result(
      prisma,
      context,
      processedResults
    );
    eliminatedIds = phase3Result.eliminated;
    livesReset = phase3Result.livesReset;
  }

  // Update the round record with final results and elimination outcomes
  await prisma.tTPhaseRound.update({
    where: { id: round.id },
    data: {
      results: storedResults,
      eliminatedIds: eliminatedIds.length > 0 ? eliminatedIds : Prisma.JsonNull,
      livesReset,
    },
  });

  // Audit log for round submission (non-critical)
  try {
    void createAuditLog({
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
      targetId: tournamentId,
      targetType: "Tournament",
      details: {
        tournamentId,
        phase,
        action: "submit_round_results",
        roundNumber,
        course: round.course,
        eliminatedIds,
        livesReset,
        resultCount: results.length,
      },
    });
  } catch (logError) {
    logger.error("Failed to create audit log for round submission", {
      error: logError instanceof Error ? logError.message : logError,
    });
  }

  return { eliminatedIds, livesReset, course: round.course };
}

/**
 * Cancel (delete) an unsubmitted round.
 *
 * Handles the "orphaned round" scenario where an admin starts a round
 * but decides to cancel before submitting results. Without this function,
 * the TTPhaseRound record would remain with empty results, wasting the
 * selected course from the 20-course cycle.
 *
 * Safety checks:
 * - Round must exist
 * - Round must not have been submitted yet (empty results array)
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @param phase - "phase1", "phase2", or "phase3"
 * @param roundNumber - The round number to cancel
 * @returns Object confirming the cancelled round number
 * @throws Error if round not found or already submitted
 */
export async function cancelPhaseRound(
  prisma: PrismaClient,
  context: PhaseContext,
  phase: "phase1" | "phase2" | "phase3",
  roundNumber: number
): Promise<{ cancelledRoundNumber: number }> {
  const logger = createLogger("ta-phase-manager");
  const { tournamentId } = context;

  // Fetch the round to verify it exists and hasn't been submitted
  const round = await prisma.tTPhaseRound.findUnique({
    where: {
      tournamentId_phase_roundNumber: {
        tournamentId,
        phase,
        roundNumber,
      },
    },
  });

  if (!round) {
    throw new Error(
      `Round ${roundNumber} not found for ${phase}`
    );
  }

  // Prevent cancelling a round that has already been submitted
  const existingResults = round.results as unknown[];
  if (existingResults && existingResults.length > 0) {
    throw new Error(
      `Round ${roundNumber} of ${phase} has already been submitted and cannot be cancelled`
    );
  }

  // Delete the orphaned round record to free the course back into the pool
  await prisma.tTPhaseRound.delete({
    where: { id: round.id },
  });

  // Audit log for round cancellation (non-critical)
  try {
    void createAuditLog({
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
      targetId: tournamentId,
      targetType: "Tournament",
      details: {
        tournamentId,
        phase,
        action: "cancel_round",
        roundNumber,
        course: round.course,
      },
    });
  } catch (logError) {
    logger.error("Failed to create audit log for round cancellation", {
      error: logError instanceof Error ? logError.message : logError,
    });
  }

  return { cancelledRoundNumber: roundNumber };
}

/**
 * Undo the last submitted round in a phase.
 *
 * This is the recovery mechanism for incorrect time entry: when a round's
 * results have already been submitted but contain errors, an admin can undo
 * the last submitted round to restore the previous state and re-submit.
 *
 * For Phase 1 / Phase 2 (simple elimination):
 * - Clears the round's results and eliminatedIds
 * - Restores eliminated players to active (eliminated = false)
 *
 * For Phase 3 (life-based):
 * - Clears the round's results and eliminatedIds
 * - Resets ALL phase3 entries to initial state
 * - Replays all previous rounds in memory to reconstruct lives/eliminated state
 * - This "replay-from-scratch" approach handles life resets correctly
 *
 * The round record itself (course assignment) is preserved so the admin
 * can re-submit times for the same course without needing to start a new round.
 *
 * Only the most recent submitted round can be undone. Trying to undo an
 * earlier round or a non-existent round throws an error.
 *
 * @param prisma - Prisma client
 * @param context - Phase context with user/request info
 * @param phase - The phase to undo the last round for
 * @returns Object with the undone round number
 * @throws Error if no submitted round exists or undo is not possible
 */
export async function undoLastPhaseRound(
  prisma: PrismaClient,
  context: PhaseContext,
  phase: "phase1" | "phase2" | "phase3"
): Promise<{ undoneRoundNumber: number }> {
  const logger = createLogger("ta-phase-manager");
  const { tournamentId, userId, ipAddress, userAgent } = context;

  // Find the last submitted round (highest roundNumber with non-empty results)
  const rounds = await prisma.tTPhaseRound.findMany({
    where: { tournamentId, phase },
    orderBy: { roundNumber: "asc" },
  });

  const submittedRounds = rounds.filter((r) => {
    const results = r.results as unknown[];
    return Array.isArray(results) && results.length > 0;
  });

  if (submittedRounds.length === 0) {
    throw new Error(`No submitted rounds found for ${phase}`);
  }

  const lastRound = submittedRounds[submittedRounds.length - 1];
  const previousRounds = submittedRounds.slice(0, submittedRounds.length - 1);

  // Clear the last round's results and eliminatedIds while keeping the course
  await prisma.tTPhaseRound.update({
    where: { id: lastRound.id },
    data: {
      // Keep an empty array rather than JsonNull so client code can safely
      // treat the round as "open again" without null checks.
      results: [],
      eliminatedIds: Prisma.JsonNull,
      livesReset: false,
    },
  });

  if (phase === "phase1" || phase === "phase2") {
    // Simple undo: restore eliminated players from this round
    const eliminatedIds = lastRound.eliminatedIds as string[] | null;
    if (eliminatedIds && eliminatedIds.length > 0) {
      await prisma.tTEntry.updateMany({
        where: { tournamentId, stage: phase, playerId: { in: eliminatedIds } },
        data: { eliminated: false },
      });
    }
  } else {
    // Phase 3: replay all previous rounds from initial state to reconstruct lives
    const config = PHASE_CONFIG.phase3;

    // Reset ALL phase3 entries to initial state
    await prisma.tTEntry.updateMany({
      where: { tournamentId, stage: "phase3" },
      data: { lives: config.initialLives, eliminated: false },
    });

    // Replay each previous round's effects in memory, then apply as a batch
    // playerId -> { lives, eliminated }
    const allEntries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: "phase3" },
      select: { playerId: true },
    });
    const playerState = new Map<string, { lives: number; eliminated: boolean }>(
      allEntries.map((e) => [e.playerId, { lives: config.initialLives, eliminated: false }])
    );

    for (const round of previousRounds) {
      const results = round.results as Array<{ playerId: string; timeMs: number }>;
      if (!Array.isArray(results) || results.length === 0) continue;

      // Only process active (non-eliminated) players
      const activeResults = results.filter((r) => {
        const state = playerState.get(r.playerId);
        return state && !state.eliminated;
      });

      // Sort by time ascending (fastest first); bottom half loses a life
      const sorted = [...activeResults].sort((a, b) => a.timeMs - b.timeMs);
      const halfwayPoint = Math.ceil(sorted.length / 2);
      const bottomHalf = sorted.slice(halfwayPoint);

      for (const result of bottomHalf) {
        const state = playerState.get(result.playerId);
        if (!state || state.eliminated) continue;
        const newLives = state.lives - 1;
        state.lives = Math.max(0, newLives);
        if (state.lives <= 0) {
          state.eliminated = true;
        }
      }

      // Apply lives reset if it happened after this round
      if (round.livesReset) {
        for (const [, state] of playerState) {
          if (!state.eliminated) {
            state.lives = config.initialLives;
          }
        }
      }
    }

    // Write reconstructed state to database using batched updateMany per unique state.
    // Groups players by (lives, eliminated) to reduce round-trips vs O(N) individual updates.
    // Players with identical state share one updateMany call.
    const stateGroups = new Map<string, { lives: number; eliminated: boolean; playerIds: string[] }>();
    for (const [playerId, state] of playerState) {
      const key = `${state.lives}:${state.eliminated}`;
      if (!stateGroups.has(key)) {
        stateGroups.set(key, { lives: state.lives, eliminated: state.eliminated, playerIds: [] });
      }
      stateGroups.get(key)!.playerIds.push(playerId);
    }
    for (const { lives, eliminated, playerIds } of stateGroups.values()) {
      await prisma.tTEntry.updateMany({
        where: { tournamentId, stage: "phase3", playerId: { in: playerIds } },
        data: { lives, eliminated },
      });
    }
  }

  // Audit log for undo operation (non-critical)
  try {
    void createAuditLog({
      userId,
      ipAddress,
      userAgent,
      action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
      targetId: tournamentId,
      targetType: "Tournament",
      details: {
        tournamentId,
        phase,
        action: "undo_round",
        roundNumber: lastRound.roundNumber,
        course: lastRound.course,
      },
    });
  } catch (logError) {
    logger.error("Failed to create audit log for round undo", {
      error: logError instanceof Error ? logError.message : logError,
    });
  }

  return { undoneRoundNumber: lastRound.roundNumber };
}
