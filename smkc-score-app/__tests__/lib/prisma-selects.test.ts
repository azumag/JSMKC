import { BM_MR_MATCH_LEAN_SELECT } from '@/lib/prisma-selects';

describe('prisma selects', () => {
  it('BM_MR_MATCH_LEAN_SELECT selects a shallow boolean payload for match queries', () => {
    const selectedFields = Object.entries(BM_MR_MATCH_LEAN_SELECT);

    expect(selectedFields.length).toBeGreaterThan(0);
    expect(selectedFields.every(([key, value]) => key.length > 0 && value === true)).toBe(true);
  });
});
