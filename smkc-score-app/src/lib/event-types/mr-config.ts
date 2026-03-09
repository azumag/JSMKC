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
import { validateMatchRaceScores } from '@/lib/score-validation';

/**
 * Calculate MR match result from race win counts.
 *
 * In the 4-course format, the player with more wins takes the match.
 * A 2-2 tie is valid and recorded as a draw in standings.
 * 0-0 indicates the match has not started yet (also treated as tie/pending).
 */
function calculateMatchResult(score1: number, score2: number): MatchResult {
  if (score1 === score2) {
    // Covers 0-0 (not started), 1-1, 2-2 (draw), etc.
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
  loggerName: 'mr-api',
  eventDisplayName: 'match race',
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
  postRequiresAuth: true,
  putRequiresAuth: true,
  /* No audit logging for MR POST (matches original behavior) */
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
    return { valid: true, data: { matchId, score1, score2, rounds } };
  },

  updateMatch: async (prisma, data) => {
    const match = await prisma.mRMatch.update({
      where: { id: data.matchId },
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
