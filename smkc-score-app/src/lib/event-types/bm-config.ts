/**
 * Battle Mode (BM) Event Type Configuration
 *
 * BM qualification uses best-of-4 rounds per match.
 * A player needs 3+ rounds to win; 2-2 is a tie.
 * Standings use round differential (winRounds - lossRounds) as tiebreaker.
 */

import { EventTypeConfig, MatchResult } from './types';
import { AUDIT_ACTIONS } from '@/lib/audit-log';
import { validateBattleModeScores } from '@/lib/score-validation';

/**
 * Calculate BM match result from round scores.
 * Total rounds must equal 4 for a valid result; otherwise treated as tie.
 */
function calculateMatchResult(score1: number, score2: number): MatchResult {
  const totalRounds = score1 + score2;
  if (totalRounds !== 4) {
    return { winner: null, result1: 'tie', result2: 'tie' };
  }
  if (score1 >= 3) {
    return { winner: 1, result1: 'win', result2: 'loss' };
  } else if (score2 >= 3) {
    return { winner: 2, result1: 'loss', result2: 'win' };
  }
  return { winner: null, result1: 'tie', result2: 'tie' };
}

export const bmConfig: EventTypeConfig = {
  eventTypeCode: 'bm',
  qualificationModel: 'bMQualification',
  matchModel: 'bMMatch',
  loggerName: 'bm-api',
  eventDisplayName: 'battle mode',
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
  postRequiresAuth: true,
  putRequiresAuth: true,
  auditAction: AUDIT_ACTIONS.CREATE_BM_MATCH,
  setupCompleteMessage: 'Battle mode setup complete',
  /*
   * §5.4: BM uses the 4 fixed battle courses in order (Battle Course 1→2→3→4).
   * Unlike MR (§6.3, §10.5), BM does NOT need random course assignment from the
   * 20 racing courses. The battle courses are always played in fixed order.
   * assignCoursesRandomly is intentionally NOT set (defaults to false).
   */

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
    // Validate BM score rules: integers, range [0,4], sum === 4 (§4.1: ties allowed).
    // Prevents silent data corruption where invalid scores (e.g. 5-0) would
    // be stored and then corrupt match result calculation (sum !== 4).
    const scoreValidation = validateBattleModeScores(score1, score2);
    if (!scoreValidation.isValid) {
      return { valid: false, error: scoreValidation.error };
    }
    return { valid: true, data: { matchId, score1, score2, rounds } };
  },

  updateMatch: async (prisma, data) => {
    const match = await prisma.bMMatch.update({
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
