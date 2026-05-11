export function isValidGpFinalsSimpleScore(
  score1: number | null,
  score2: number | null,
  targetWins: number,
): boolean {
  if (
    score1 === null ||
    score2 === null ||
    score1 > targetWins ||
    score2 > targetWins
  ) {
    return false;
  }

  const player1Won = score1 === targetWins && score2 < targetWins;
  const player2Won = score2 === targetWins && score1 < targetWins;
  return player1Won || player2Won;
}
