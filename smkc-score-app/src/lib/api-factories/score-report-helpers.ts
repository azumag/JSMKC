/**
 * Score Report Shared Helpers
 *
 * Provides reusable helper functions extracted from the BM, MR, and GP
 * score report API routes. These helpers encapsulate the common sub-patterns
 * shared across the dual-report confirmation system:
 *
 * - Session-based authorization (admin + player)
 * - Score entry audit logging
 * - Character usage tracking
 * - Character validation
 *
 * Each score report route (BM/MR/GP) imports only the helpers it needs
 * and retains its own event-type-specific orchestration logic.
 *
 * Note: Rate limiting has been removed from this project as it is an
 * internal tournament tool with few concurrent users. The rate-limiting
 * functions are no longer used and have been removed.
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { SMK_CHARACTERS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';

// ============================================================
// Types
// ============================================================

/**
 * Minimal match shape required by the authorization check.
 * Includes userId for player-to-user linkage verification.
 */
export interface AuthCheckMatch {
  player1Id: string;
  player2Id: string;
  player1: { userId: string } | null;
  player2: { userId: string } | null;
}

/**
 * Data required to create a score entry audit log.
 */
export interface ScoreEntryLogData {
  tournamentId: string;
  matchId: string;
  matchType: string;
  playerId: string;
  reportedData: unknown;
  clientIp: string;
  userAgent: string;
}

/**
 * Data required to create a character usage log entry.
 */
export interface CharacterUsageLogData {
  matchId: string;
  matchType: string;
  playerId: string;
  character: string;
  tournamentId: string;
}

// ============================================================
// Authorization
// ============================================================

/**
 * Session-based authorization check for score report endpoints.
 *
 * Supports two authorization paths:
 * 1. Admin session - full admin override capability
 * 2. Player session - players can only report their own matches
 *
 * Used by BM, MR, and GP report routes.
 *
 * @param request - The incoming NextRequest (used for future extensions)
 * @param tournamentId - Tournament ID (used for future extensions)
 * @param reportingPlayer - Which player position is reporting (1 or 2)
 * @param match - Match record with player IDs
 * @returns True if the request is authorized
 */
export async function checkScoreReportAuth(
  request: NextRequest,
  tournamentId: string,
  reportingPlayer: number,
  match: AuthCheckMatch,
): Promise<boolean> {
  let isAuthorized = false;
  const session = await auth();

  /* Session-based authorization: admin or player */
  if (session?.user?.id) {
    if (session.user.role === 'admin') {
      /* Admins have unrestricted access to report scores */
      isAuthorized = true;
    } else if (session.user.userType === 'player') {
      /*
       * Direct player login - verify they own the player account AND are a
       * participant in this match. Checks BOTH playerId (to verify the player
       * record) AND userId (to verify the session owner is linked to that player).
       */
      const playerId = session.user.playerId;
      const userId = session.user.id;
      if (reportingPlayer === 1 && match.player1Id === playerId &&
          match.player1?.userId === userId) {
        isAuthorized = true;
      }
      if (reportingPlayer === 2 && match.player2Id === playerId &&
          match.player2?.userId === userId) {
        isAuthorized = true;
      }
    }
  }

  return isAuthorized;
}

// ============================================================
// Audit Logging
// ============================================================

/**
 * Create a score entry log for audit trail and dispute resolution.
 *
 * This is a non-critical operation: failures are logged as warnings
 * but do not interrupt the score reporting flow.
 *
 * @param logger - Logger instance scoped to the calling route
 * @param data - Score entry log data
 */
export async function createScoreEntryLog(
  logger: ReturnType<typeof createLogger>,
  data: ScoreEntryLogData,
): Promise<void> {
  try {
    await prisma.scoreEntryLog.create({
      data: {
        tournamentId: data.tournamentId,
        matchId: data.matchId,
        matchType: data.matchType,
        playerId: data.playerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reportedData: data.reportedData as any,
        ipAddress: data.clientIp,
        userAgent: data.userAgent,
      },
    });
  } catch (logError) {
    logger.warn('Failed to create score entry log', {
      error: logError,
      tournamentId: data.tournamentId,
      matchId: data.matchId,
      playerId: data.playerId,
    });
  }
}

/**
 * Log character usage for post-tournament statistics.
 *
 * This is a non-critical operation: failures are logged as warnings
 * but do not interrupt the score reporting flow.
 *
 * @param logger - Logger instance scoped to the calling route
 * @param data - Character usage log data
 */
export async function createCharacterUsageLog(
  logger: ReturnType<typeof createLogger>,
  data: CharacterUsageLogData,
): Promise<void> {
  try {
    await prisma.matchCharacterUsage.create({
      data: {
        matchId: data.matchId,
        matchType: data.matchType,
        playerId: data.playerId,
        character: data.character,
      },
    });
  } catch (charError) {
    logger.warn('Failed to create character usage log', {
      error: charError,
      tournamentId: data.tournamentId,
      matchId: data.matchId,
      playerId: data.playerId,
      character: data.character,
    });
  }
}

// ============================================================
// Validation
// ============================================================

/**
 * Validate a character selection against the official SMK character roster.
 *
 * Returns true if the character is valid or not provided (no selection).
 * Returns false only when a character is provided but not in the roster.
 *
 * @param character - The character string to validate (may be undefined)
 * @returns True if valid or absent, false if invalid
 */
/**
 * Check if dual report mode is enabled for a tournament.
 * When disabled (default), player score reports are immediately confirmed.
 * When enabled, both players must report matching scores for auto-confirmation.
 */
export async function isDualReportEnabled(tournamentId: string): Promise<boolean> {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { dualReportEnabled: true },
    });
    return tournament?.dualReportEnabled === true;
  } catch (error) {
    const logger = createLogger('score-report-helpers');
    logger.warn('Failed to check dual report status', { tournamentId, error });
    return false;
  }
}

export function validateCharacter(character: string | undefined): boolean {
  if (!character) return true;
  return SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number]);
}

// ============================================================
// Player Stats Recalculation
// ============================================================

/**
 * Possible match outcome from the perspective of a single player.
 * 'no_contest' indicates the match was voided (e.g., 0-0 cleared) and should not be counted.
 */
export type MatchOutcome = 'win' | 'loss' | 'tie' | 'no_contest';

/**
 * Configuration for recalculatePlayerStats, parameterized per game mode.
 *
 * Each 2P mode (BM, MR, GP) uses the same recalculation pattern:
 * query completed qualification matches → accumulate stats → update qualification record.
 *
 * The differences are:
 * - Prisma model names for matches and qualifications
 * - Score field names (BM/MR: score1/score2, GP: points1/points2)
 * - Win/loss determination logic (BM uses calculateMatchResult, MR/GP use direct comparison)
 * - Points accumulation (BM/MR: round differential, GP: absolute driver points)
 */
export interface RecalculateStatsConfig {
  /** Prisma model name for match queries (e.g. 'bMMatch') */
  matchModel: string;
  /** Prisma model name for qualification stats updates (e.g. 'bMQualification') */
  qualificationModel: string;
  /** Field names on the match model for player 1 and player 2 scores */
  scoreFields: { p1: string; p2: string };
  /** Determine match outcome from the reporting player's perspective */
  determineResult: (myScore: number, oppScore: number) => MatchOutcome;
  /**
   * If true, tracks winRounds/lossRounds per match and stores their
   * differential as the `points` field (BM/MR pattern).
   * If false, accumulates the player's score as total `points` (GP pattern).
   */
  useRoundDifferential: boolean;
}

/**
 * Recalculate qualification stats for a player from all completed matches.
 *
 * This is called after a match is confirmed (dual-report agreement or admin override)
 * to ensure the player's aggregate stats are consistent with the match results.
 *
 * Common formula across all 2P modes:
 * - score (match points) = wins × 2 + ties
 * - mp (matches played) = count of completed matches
 *
 * Mode-specific behavior is injected via the config parameter.
 *
 * @param config - Mode-specific configuration (models, fields, win logic)
 * @param tournamentId - Tournament identifier
 * @param playerId - Player identifier to recalculate stats for
 */
export async function recalculatePlayerStats(
  config: RecalculateStatsConfig,
  tournamentId: string,
  playerId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchDelegate = (prisma as any)[config.matchModel];

  const matches = await matchDelegate.findMany({
    where: {
      tournamentId,
      stage: 'qualification',
      completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  let mp = 0, wins = 0, ties = 0, losses = 0;
  let winRounds = 0, lossRounds = 0, totalPoints = 0;

  for (const m of matches) {
    const isPlayer1 = m.player1Id === playerId;
    const myScore: number = isPlayer1
      ? m[config.scoreFields.p1]
      : m[config.scoreFields.p2];
    const oppScore: number = isPlayer1
      ? m[config.scoreFields.p2]
      : m[config.scoreFields.p1];

    const result = config.determineResult(myScore, oppScore);
    // 'no_contest' matches (e.g., 0-0 cleared) should not be counted in stats
    if (result === 'no_contest') continue;
    mp++;
    if (result === 'win') wins++;
    else if (result === 'loss') losses++;
    else ties++;

    if (config.useRoundDifferential) {
      winRounds += myScore;
      lossRounds += oppScore;
    } else {
      totalPoints += myScore;
    }
  }

  const score = wins * 2 + ties;

  /* Build update data based on mode configuration */
  const data = config.useRoundDifferential
    ? { mp, wins, ties, losses, winRounds, lossRounds, points: winRounds - lossRounds, score }
    : { mp, wins, ties, losses, points: totalPoints, score };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualDelegate = (prisma as any)[config.qualificationModel];

  await qualDelegate.updateMany({
    where: { tournamentId, playerId },
    data,
  });
}
