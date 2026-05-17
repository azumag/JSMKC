import type { Player } from "@/lib/types";

interface GpFinalsWinnerMatch {
  completed: boolean;
  points1?: number | null;
  points2?: number | null;
  score1?: number | null;
  score2?: number | null;
  player1: Player;
  player2: Player;
  suddenDeathWinnerId?: string | null;
}

function gpFinalsScore(match: GpFinalsWinnerMatch, side: 1 | 2): number {
  return side === 1
    ? match.points1 ?? match.score1 ?? 0
    : match.points2 ?? match.score2 ?? 0;
}

export function getGpFinalsMatchWinner(match: GpFinalsWinnerMatch): Player | null {
  if (!match.completed) return null;

  const score1 = gpFinalsScore(match, 1);
  const score2 = gpFinalsScore(match, 2);
  if (score1 > score2) return match.player1;
  if (score2 > score1) return match.player2;

  /*
   * Backward compatibility for GP finals rows saved before cupResults became
   * the source of truth. Those legacy rows can be completed with tied
   * points1/points2 and a suddenDeathWinnerId. New saves clear that field and
   * resolve tied cups by additional cupResults, but historical brackets still
   * need to highlight the winner and show the champion without requiring a
   * destructive data migration.
   */
  if (match.suddenDeathWinnerId === match.player1.id) return match.player1;
  if (match.suddenDeathWinnerId === match.player2.id) return match.player2;

  return null;
}
