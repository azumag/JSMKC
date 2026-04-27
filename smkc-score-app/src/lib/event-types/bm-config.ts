/**
 * Battle Mode (BM) Event Type Configuration
 *
 * BM qualification uses best-of-4 rounds per match.
 * A player needs 3+ rounds to win; 2-2 is a tie.
 * Standings use round differential (winRounds - lossRounds) as tiebreaker.
 */

import { EventTypeConfig, MatchResult } from './types';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { AUDIT_ACTIONS } from '@/lib/audit-log';
import { validateBattleModeScores } from '@/lib/score-validation';

/**
 * Calculate BM match result from round scores.
 * - 0-0 (cleared match): returns 'no_contest' - match does not count in standings
 * - sum !== 4: returns 'no_contest' - invalid match (should not reach here if validation works)
 * - sum === 4 with score >= 3: returns 'win' or 'loss'
 * - sum === 4 with score < 3: returns 'tie' (2-2 is a valid draw per §4.1)
 */
function calculateMatchResult(score1: number, score2: number): MatchResult {
  // 0-0 indicates admin-cleared match (voided) - does not count
  if (score1 === 0 && score2 === 0) {
    return { winner: null, result1: 'no_contest', result2: 'no_contest' };
  }
  const totalRounds = score1 + score2;
  if (totalRounds !== 4) {
    return { winner: null, result1: 'no_contest', result2: 'no_contest' };
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
  matchScoreFields: { p1: 'score1', p2: 'score2' },
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
   *
   * fixedCourseList stores the battle-course abbreviations (BC1–BC4) on every
   * non-BYE qualification match so overlay events can expose `matchResult.courses`
   * on match_completed notifications. In the BM context "BC" stands for Battle
   * Course, distinct from the Bowser Castle racing courses in the racing-mode pool.
   */
  fixedCourseList: ['BC1', 'BC2', 'BC3', 'BC4'] as const,
  /* §5.4: Each round-robin day gets a random starting Battle Course (1-4) shared
   * across ALL groups. Different days may differ; same day always shares one course. */
  assignBmStartingCourseByDay: true,

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
      include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
    });
    return { match, score1OrPoints1: data.score1!, score2OrPoints2: data.score2! };
  },

  calculateMatchResult,

  aggregatePlayerStats: (matches, playerId, calcResult) => {
    const stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };
    for (const m of matches) {
      // Skip 0-0 matches: these are admin-cleared matches (not actual ties).
      // A 0-0 score indicates the match was voided and should not affect standings.
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
