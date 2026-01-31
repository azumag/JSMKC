/**
 * Battle Mode (BM) Event Type Configuration
 *
 * BM qualification uses best-of-4 rounds per match.
 * A player needs 3+ rounds to win; 2-2 is a tie.
 * Standings use round differential (winRounds - lossRounds) as tiebreaker.
 */

import { EventTypeConfig, MatchResult } from './types';
import { AUDIT_ACTIONS } from '@/lib/audit-log';

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
  qualificationModel: 'bMQualification',
  matchModel: 'bMMatch',
  loggerName: 'bm-api',
  eventDisplayName: 'battle mode',
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
  postRequiresAuth: true,
  auditAction: AUDIT_ACTIONS.CREATE_BM_MATCH,
  setupCompleteMessage: 'Battle mode setup complete',

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
    return { valid: true, data: { matchId, score1, score2, rounds } };
  },

  updateMatch: async (prisma, data) => {
    const match = await prisma.bMMatch.update({
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
