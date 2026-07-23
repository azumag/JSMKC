import type { BracketMatch } from '@/types/bracket';

export interface BracketWinnerMatch {
  completed: boolean;
  player1Id: string | null;
  player2Id: string | null;
  score1: number;
  score2: number;
  winnerOverrideId?: string | null;
}

export type BracketWinnerResolver<TMatch extends BracketWinnerMatch> = (
  match: TMatch,
  bracketMatch: BracketMatch,
) => string | null;

export function resolveBracketWinnerFlags<TMatch extends BracketWinnerMatch>(
  match: TMatch | undefined,
  bracketMatch: BracketMatch,
  targetWins: number,
  getWinnerId?: BracketWinnerResolver<TMatch>,
) {
  if (!match?.completed) {
    return { isWinner1: false, isWinner2: false };
  }

  if (match.winnerOverrideId) {
    return {
      isWinner1: match.winnerOverrideId === match.player1Id,
      isWinner2: match.winnerOverrideId === match.player2Id,
    };
  }

  /*
   * Some modes need a persisted winner that is not recoverable from score
   * ordering alone. GP legacy sudden-death rows are completed with tied
   * score1/score2 after points1/points2 are mapped for bracket display, so an
   * explicit resolver must take precedence when the page provides one.
   */
  const customWinnerId = getWinnerId?.(match, bracketMatch);
  if (customWinnerId !== undefined) {
    return {
      isWinner1: customWinnerId === match.player1Id,
      isWinner2: customWinnerId === match.player2Id,
    };
  }

  return {
    isWinner1: match.score1 >= targetWins && match.score1 > match.score2,
    isWinner2: match.score2 >= targetWins && match.score2 > match.score1,
  };
}
