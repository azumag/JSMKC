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
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

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
  userId: string;
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
    include: { player: true },
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
    include: { player: true },
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

  if (qualifiers.length === 0) {
    throw new Error("No players found in qualification ranks 17-24 for Phase 1");
  }

  const createdEntries: TTEntry[] = [];
  const skippedPlayers: string[] = [];

  for (const qual of qualifiers) {
    // Skip players without total time (incomplete qualification)
    if (qual.totalTime === null) {
      const playerEntry = qual as TTEntry & { player: { nickname: string } };
      skippedPlayers.push(playerEntry.player.nickname);
      continue;
    }

    // Check if already exists in phase1 to prevent duplicate promotion
    const existing = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: qual.playerId,
          stage: "phase1",
        },
      },
    });

    if (!existing) {
      // Create phase1 entry with qualification data carried forward
      // Lives set to 0 because phase1 uses direct elimination (no life system)
      const entry = await prisma.tTEntry.create({
        data: {
          tournamentId,
          playerId: qual.playerId,
          stage: "phase1",
          lives: 0, // No lives in phase1
          eliminated: false,
          times: qual.times as Prisma.InputJsonValue,
          totalTime: qual.totalTime,
          rank: qual.rank,
        },
        include: { player: true },
      });
      createdEntries.push(entry);

      // Audit log for accountability (failure is non-critical)
      try {
        await createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerId: qual.playerId,
            playerNickname: entry.player.nickname,
            qualRank: qual.rank,
            promotedTo: "phase1",
          },
        });
      } catch (logError) {
        logger.error("Failed to create audit log", {
          error: logError instanceof Error ? logError.message : logError,
        });
      }
    }
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

  if (allPlayers.length === 0) {
    throw new Error("No players available for Phase 2");
  }

  const createdEntries: TTEntry[] = [];
  const skippedPlayers: string[] = [];

  for (const source of allPlayers) {
    // Skip players without completed times
    if (source.totalTime === null) {
      const playerEntry = source as TTEntry & { player: { nickname: string } };
      skippedPlayers.push(playerEntry.player.nickname);
      continue;
    }

    // Prevent duplicate promotion
    const existing = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: source.playerId,
          stage: "phase2",
        },
      },
    });

    if (!existing) {
      // Create phase2 entry with source stage data carried forward
      const entry = await prisma.tTEntry.create({
        data: {
          tournamentId,
          playerId: source.playerId,
          stage: "phase2",
          lives: 0, // No lives in phase2
          eliminated: false,
          times: source.times as Prisma.InputJsonValue,
          totalTime: source.totalTime,
          rank: source.rank,
        },
        include: { player: true },
      });
      createdEntries.push(entry);

      // Audit log for accountability (non-critical)
      try {
        await createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerId: source.playerId,
            playerNickname: entry.player.nickname,
            sourceStage: source.stage,
            promotedTo: "phase2",
          },
        });
      } catch (logError) {
        logger.error("Failed to create audit log", {
          error: logError instanceof Error ? logError.message : logError,
        });
      }
    }
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

  if (allPlayers.length === 0) {
    throw new Error("No players available for Phase 3 (Finals)");
  }

  const createdEntries: TTEntry[] = [];
  const skippedPlayers: string[] = [];

  for (const source of allPlayers) {
    // Skip players without completed times
    if (source.totalTime === null) {
      const playerEntry = source as TTEntry & { player: { nickname: string } };
      skippedPlayers.push(playerEntry.player.nickname);
      continue;
    }

    // Prevent duplicate promotion
    const existing = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: source.playerId,
          stage: "phase3",
        },
      },
    });

    if (!existing) {
      // Create phase3 entry with initial lives for life-based elimination
      const entry = await prisma.tTEntry.create({
        data: {
          tournamentId,
          playerId: source.playerId,
          stage: "phase3",
          lives: config.initialLives, // Start with 3 lives
          eliminated: false,
          times: source.times as Prisma.InputJsonValue,
          totalTime: source.totalTime,
          rank: source.rank,
        },
        include: { player: true },
      });
      createdEntries.push(entry);

      // Audit log for accountability (non-critical)
      try {
        await createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerId: source.playerId,
            playerNickname: entry.player.nickname,
            sourceStage: source.stage,
            promotedTo: "phase3",
            initialLives: config.initialLives,
          },
        });
      } catch (logError) {
        logger.error("Failed to create audit log", {
          error: logError instanceof Error ? logError.message : logError,
        });
      }
    }
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

  // Eliminate the slowest player (first in descending sort)
  const slowestPlayer = sortedResults[0];

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
    await createAuditLog({
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
        await createAuditLog({
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

  // Check if remaining player count matches a life reset threshold
  const remainingPlayers = await getActivePhasePlayers(
    prisma,
    tournamentId,
    "phase3"
  );
  const remainingCount = remainingPlayers.length;

  let livesReset = false;
  // Check if remaining count matches any reset threshold (8, 4, or 2 players)
  // Using indexOf instead of includes to avoid tuple type constraint
  if ((config.lifeResetThresholds as readonly number[]).includes(remainingCount)) {
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
      await createAuditLog({
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
  const phases = ["phase1", "phase2", "phase3"] as const;
  const status: {
    phase1: { total: number; active: number; eliminated: number } | null;
    phase2: { total: number; active: number; eliminated: number } | null;
    phase3: { total: number; active: number; eliminated: number; winner: string | null } | null;
    currentPhase: string;
  } = {
    phase1: null,
    phase2: null,
    phase3: null,
    currentPhase: "qualification",
  };

  // Check each phase in order to determine current phase and status
  for (const phase of phases) {
    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: phase },
      include: { player: true },
    });

    if (entries.length > 0) {
      const active = entries.filter((e) => !e.eliminated);
      const eliminated = entries.filter((e) => e.eliminated);

      if (phase === "phase3") {
        // Phase 3 has special winner detection (last player standing)
        status.phase3 = {
          total: entries.length,
          active: active.length,
          eliminated: eliminated.length,
          winner: active.length === 1 ? active[0].player.nickname : null,
        };
      } else {
        status[phase] = {
          total: entries.length,
          active: active.length,
          eliminated: eliminated.length,
        };
      }

      // Update current phase to the latest phase with entries
      status.currentPhase = phase;
    }
  }

  return status;
}
