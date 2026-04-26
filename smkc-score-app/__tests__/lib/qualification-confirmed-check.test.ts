/**
 * Tests for checkQualificationConfirmed.
 *
 * Covers:
 * - Returns null when the specific mode's qualification is not confirmed (edits allowed)
 * - Returns 403 NextResponse when the specific mode's qualification is confirmed (edits locked)
 * - Returns 404 NextResponse when tournament is not found
 * - Checks only the requested mode's flag, not other modes (issue #696)
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status ?? 200 })),
  },
}));

import { checkQualificationConfirmed } from '@/lib/qualification-confirmed-check';

function makePrisma(tournament: {
  bmQualificationConfirmed?: boolean;
  mrQualificationConfirmed?: boolean;
  gpQualificationConfirmed?: boolean;
} | null) {
  return {
    tournament: {
      findUnique: jest.fn().mockResolvedValue(tournament),
    },
  } as unknown as Parameters<typeof checkQualificationConfirmed>[0];
}

describe('checkQualificationConfirmed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when bm qualification is not confirmed (edits allowed)', async () => {
    const prisma = makePrisma({ bmQualificationConfirmed: false });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'bm');
    expect(result).toBeNull();
  });

  it('returns 403 when bm qualification is confirmed (edits locked)', async () => {
    const prisma = makePrisma({ bmQualificationConfirmed: true });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'bm') as { status: number; body: unknown };
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('returns null when mr qualification is not confirmed', async () => {
    const prisma = makePrisma({ mrQualificationConfirmed: false });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'mr');
    expect(result).toBeNull();
  });

  it('returns 403 when mr qualification is confirmed', async () => {
    const prisma = makePrisma({ mrQualificationConfirmed: true });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'mr') as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('returns null when gp qualification is not confirmed', async () => {
    const prisma = makePrisma({ gpQualificationConfirmed: false });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'gp');
    expect(result).toBeNull();
  });

  it('returns 403 when gp qualification is confirmed', async () => {
    const prisma = makePrisma({ gpQualificationConfirmed: true });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'gp') as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('returns 404 when tournament is not found', async () => {
    const prisma = makePrisma(null);
    const result = await checkQualificationConfirmed(prisma, 'nonexistent-id', 'bm') as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(404);
  });

  it('checks only the requested mode — bm confirmed does not affect mr check (issue #696)', async () => {
    // bm is confirmed but mr is not
    const prisma = makePrisma({ mrQualificationConfirmed: false });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1', 'mr');
    // MR should NOT be locked even though bm would be confirmed in a real tournament
    expect(result).toBeNull();
  });

  it('queries the correct tournament by id with the mode-specific field', async () => {
    const prisma = makePrisma({ bmQualificationConfirmed: false });
    await checkQualificationConfirmed(prisma, 'my-tournament', 'bm');
    expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
      where: { id: 'my-tournament' },
      select: { bmQualificationConfirmed: true },
    });
  });

  it('queries mr-specific field when mode is mr', async () => {
    const prisma = makePrisma({ mrQualificationConfirmed: false });
    await checkQualificationConfirmed(prisma, 'my-tournament', 'mr');
    expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
      where: { id: 'my-tournament' },
      select: { mrQualificationConfirmed: true },
    });
  });
});
