import { BM_MR_MATCH_LEAN_SELECT } from '@/lib/prisma-selects';

describe('prisma select shapes', () => {
  it('keeps the BM/MR match lean select sufficient for score updates', () => {
    expect(BM_MR_MATCH_LEAN_SELECT).toEqual({
      id: true,
      tournamentId: true,
      player1Id: true,
      player2Id: true,
      score1: true,
      score2: true,
      rounds: true,
      completed: true,
      isBye: true,
    });
  });
});
