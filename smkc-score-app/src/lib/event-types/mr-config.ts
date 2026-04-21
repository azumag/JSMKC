/**
 * Match Race (MR) Event Type Configuration
 *
 * MR qualification uses a fixed 4-course format (§6.3, §10.5):
 * all 4 pre-assigned courses are always played; the player who wins more
 * races takes the match. A 2-2 result is recorded as a draw.
 * Standings use round differential (winRounds - lossRounds) as tiebreaker.
 *
 * Courses are randomly shuffled at qualification setup time (assignCoursesRandomly: true)
 * and 4 courses are assigned to each match sequentially from the shuffled list.
 *
 * Security fix: postRequiresAuth is now true (previously MR POST had no auth check).
 */

import { EventTypeConfig, MatchResult } from './types';
import { AUDIT_ACTIONS } from '@/lib/audit-log';
import { validateMatchRaceScores } from '@/lib/score-validation';

/**
 * Calculate MR match result from race win counts.
 *
 * In the 4-course format, the player with more wins takes the match.
 * A 2-2 tie is valid and recorded as a draw in standings.
 * 0-0 indicates a cleared/voided match — treated as no_contest so it does
 * not affect standings (§4.1: a draw in the context of a 0-point round is
 * a non-result, distinct from a regular 2-2 draw).
 */
function calculateMatchResult(score1: number, score2: number): MatchResult {
  // 0-0 is a cleared match — not a real result; skip in standings
  if (score1 === 0 && score2 === 0) {
    return { winner: null, result1: 'no_contest', result2: 'no_contest' };
  }
  if (score1 === score2) {
    // Covers 1-1, 2-2 (draw), etc.
    return { winner: null, result1: 'tie', result2: 'tie' };
  }
  if (score1 > score2) {
    return { winner: 1, result1: 'win', result2: 'loss' };
  }
  return { winner: 2, result1: 'loss', result2: 'win' };
}

export const mrConfig: EventTypeConfig = {
  eventTypeCode: 'mr',
  qualificationModel: 'mRQualification',
  matchModel: 'mRMatch',
  matchScoreFields: { p1: 'score1', p2: 'score2' },
  loggerName: 'mr-api',
  eventDisplayName: 'match race',
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
  postRequiresAuth: true,
  putRequiresAuth: true,
  // Audit MR qualification setup for consistency with BM (§10.6 traceability)
  auditAction: AUDIT_ACTIONS.CREATE_MR_MATCH,
  setupCompleteMessage: 'Match race setup complete',
  /*
   * §10.5: Randomly shuffle all 20 courses and assign 4 to each match sequentially.
   * This ensures courses are pre-determined before matches begin, so players use
   * the courses specified on the "match card" rather than freely selecting them.
   */
  assignCoursesRandomly: true,

  parsePutBody: (body) => {
    const { matchId, score1, score2, rounds } = body as {
      matchId?: string;
      score1?: number;
      score2?: number;
      rounds?: unknown;
    };
    if (!matchId || score1 === undefined || score2 === undefined) {
      return { valid: false, error: 'matchId, score1, and score2 are required' };
    }
    // Validate MR score rules: each score must be an integer in [0, 4] and sum to 4.
    // BYE matches (score 4-0) are auto-completed at creation, not via PUT, so they
    // never reach this validation path.
    const scoreValidation = validateMatchRaceScores(score1, score2);
    if (!scoreValidation.isValid) {
      return { valid: false, error: scoreValidation.error };
    }
    /* Validate rounds array if provided: each round must have course and winner */
    if (rounds !== undefined && rounds !== null) {
      if (!Array.isArray(rounds)) {
        return { valid: false, error: 'rounds must be an array' };
      }
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as Record<string, unknown>;
        if (!r || typeof r !== 'object' || !r.course || r.winner === undefined) {
          return { valid: false, error: `Round ${i + 1}: course and winner are required` };
        }
      }
    }
    return { valid: true, data: { matchId, score1, score2, rounds } };
  },

  updateMatch: async (prisma, data) => {
    const match = await prisma.mRMatch.update({
      where: { id: data.matchId, tournamentId: data.tournamentId },
      data: {
        score1: data.score1,
        score2: data.score2,
        rounds: data.rounds || null,
        completed: true,
      },
      include: { player1: true, player2: true },
    });
    return { match, score1OrPoints1: data.score1!, score2OrPoints2: data.score2! };
  },

  calculateMatchResult,

  aggregatePlayerStats: (matches, playerId, calcResult) => {
    const stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };
    for (const m of matches) {
      // Skip 0-0 matches: admin-cleared matches should not affect standings
      const isClearedMatch = m.score1 === 0 && m.score2 === 0;
      if (isClearedMatch) continue;

      stats.mp++;
      const isPlayer1 = m.player1Id === playerId;
      stats.winRounds += isPlayer1 ? m.score1 : m.score2;
      stats.lossRounds += isPlayer1 ? m.score2 : m.score1;
      const { result1 } = calcResult(
        isPlayer1 ? m.score1 : m.score2,
        isPlayer1 ? m.score2 : m.score1,
      );
      if (result1 === 'win') stats.wins++;
      else if (result1 === 'loss') stats.losses++;
      else stats.ties++;
    }
    const score = stats.wins * 2 + stats.ties;
    return {
      stats,
      score,
      qualificationData: { ...stats, points: stats.winRounds - stats.lossRounds, score },
    };
  },
};
