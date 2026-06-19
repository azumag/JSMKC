import { BM_MR_MATCH_LEAN_SELECT } from '@/lib/prisma-selects';

describe('prisma selects', () => {
  it('BM_MR_MATCH_LEAN_SELECT selects a shallow boolean payload for match queries', () => {
    const selectedFields = Object.entries(BM_MR_MATCH_LEAN_SELECT);

    expect(selectedFields.length).toBeGreaterThan(0);
    expect(selectedFields.every(([key, value]) => key.length > 0 && value === true)).toBe(true);
  });

  it('BM_MR_MATCH_LEAN_SELECT contains exactly the expected fields', () => {
    // Issue #2024: satisfies only catches required-field deletions. This guards against
    // accidental additions (e.g. createdAt: true) that would silently inflate lean queries
    // and potentially expose unexpected fields in BM/MR API responses.
    const EXPECTED_FIELDS = [
      'id', 'tournamentId', 'player1Id', 'player2Id',
      'score1', 'score2', 'rounds', 'completed', 'isBye',
    ];
    expect(Object.keys(BM_MR_MATCH_LEAN_SELECT)).toEqual(EXPECTED_FIELDS);
  });
});
