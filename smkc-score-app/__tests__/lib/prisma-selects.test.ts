import { BM_MR_MATCH_LEAN_SELECT } from '@/lib/prisma-selects';

describe('prisma selects', () => {
  it('BM_MR_MATCH_LEAN_SELECT is a strict boolean contract for shared match payload', () => {
    const expectedFields = [
      'id',
      'tournamentId',
      'player1Id',
      'player2Id',
      'score1',
      'score2',
      'rounds',
      'completed',
      'isBye',
    ];

    const selectedFields = Object.entries(BM_MR_MATCH_LEAN_SELECT);

    expect(selectedFields.every(([, value]) => value === true)).toBe(true);
    expect(Object.keys(BM_MR_MATCH_LEAN_SELECT)).toEqual(expect.arrayContaining(expectedFields));
    expect(Object.keys(BM_MR_MATCH_LEAN_SELECT).length).toBeGreaterThanOrEqual(expectedFields.length);
  });
});
