/**
 * Score Report Shared Helpers
 *
 * Provides reusable helper functions extracted from the BM, MR, and GP
 * score report API routes. These helpers encapsulate the common sub-patterns
 * shared across the dual-report confirmation system:
 *
 * - Multi-method authorization (token + session)
 * - Score entry audit logging
 * - Character usage tracking
 * - Character validation
 * - Rate limiting with standard 429 response
 *
 * Each score report route (BM/MR/GP) imports only the helpers it needs
 * and retains its own event-type-specific orchestration logic.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { rateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { validateTournamentToken } from '@/lib/token-validation';
import { auth } from '@/lib/auth';
import { SMK_CHARACTERS } from '@/lib/constants';
import { createLogger } from '@/lib/logger';

// ============================================================
// Types
// ============================================================

/**
 * Minimal match shape required by the authorization check.
 * Includes player IDs and optional userId fields for OAuth-linked players.
 */
export interface AuthCheckMatch {
  player1Id: string;
  player2Id: string;
  player1: { userId?: string | null };
  player2: { userId?: string | null };
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

/**
 * Result of the applyRateLimit helper.
 */
export interface RateLimitCheckResult {
  /** Whether the request is allowed (under the limit) */
  allowed: boolean;
  /** Client IP extracted from the request */
  clientIp: string;
  /** Pre-built 429 response when rate limited (only set when allowed is false) */
  response?: NextResponse;
}

// ============================================================
// Authorization
// ============================================================

/**
 * Multi-method authorization check for score report endpoints.
 *
 * Supports three authorization paths:
 * 1. Tournament token - for link-based participant access
 * 2. Admin session - full admin override capability
 * 3. Player session - players can only report their own matches
 *    (direct player login or OAuth-linked player)
 *
 * Used by BM, MR, and GP report routes.
 *
 * @param request - The incoming NextRequest
 * @param tournamentId - Tournament ID for token validation
 * @param reportingPlayer - Which player position is reporting (1 or 2)
 * @param match - Match record with player IDs and userId references
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

  /* Path 1: Tournament token authorization */
  const tokenValidation = await validateTournamentToken(request, tournamentId);
  if (tokenValidation.tournament) {
    isAuthorized = true;
  }

  /* Path 2 & 3: Session-based authorization */
  if (session?.user?.id) {
    const userType = session.user.userType;

    if (userType === 'admin' && session.user.role === 'admin') {
      /* Admins have unrestricted access to report scores */
      isAuthorized = true;
    } else if (userType === 'player') {
      /* Direct player login - verify they are a participant in this match */
      const playerId = session.user.playerId;
      if (reportingPlayer === 1 && match.player1Id === playerId) {
        isAuthorized = true;
      }
      if (reportingPlayer === 2 && match.player2Id === playerId) {
        isAuthorized = true;
      }
    } else {
      /* OAuth-linked player - check via userId on the player record */
      if (reportingPlayer === 1 && match.player1.userId === session.user.id) {
        isAuthorized = true;
      }
      if (reportingPlayer === 2 && match.player2.userId === session.user.id) {
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
export function validateCharacter(character: string | undefined): boolean {
  if (!character) return true;
  return SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number]);
}

// ============================================================
// Rate Limiting
// ============================================================

/**
 * Apply rate limiting and return a pre-built 429 response if limited.
 *
 * Extracts the client IP from the request, checks the rate limit,
 * and returns a result object. The caller can immediately return
 * the `response` field if `allowed` is false.
 *
 * Used by MR and GP routes which use raw NextResponse for rate limit errors.
 * BM uses its own rate limit handling with handleRateLimitError.
 *
 * @param request - The incoming NextRequest
 * @param maxRequests - Maximum requests allowed in the window
 * @param durationMs - Time window in milliseconds
 * @returns Rate limit check result with client IP and optional 429 response
 */
export async function applyRateLimit(
  request: NextRequest,
  maxRequests: number,
  durationMs: number,
): Promise<RateLimitCheckResult> {
  const clientIp = getClientIdentifier(request);
  const rateLimitResult = await rateLimit(clientIp, maxRequests, durationMs);

  if (!rateLimitResult.success) {
    return {
      allowed: false,
      clientIp,
      response: NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      ),
    };
  }

  return { allowed: true, clientIp };
}
