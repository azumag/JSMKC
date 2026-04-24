/**
 * Tests for checkQualificationConfirmed.
 *
 * Covers:
 * - Returns null when qualification is not confirmed (edits allowed)
 * - Returns 403 NextResponse when qualification is confirmed (edits locked)
 * - Returns 404 NextResponse when tournament is not found
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status ?? 200 })),
  },
}));

import { checkQualificationConfirmed } from '@/lib/qualification-confirmed-check';

function makePrisma(tournament: { qualificationConfirmed: boolean } | null) {
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

  it('returns null when qualification is not confirmed (edits allowed)', async () => {
    const prisma = makePrisma({ qualificationConfirmed: false });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1');
    expect(result).toBeNull();
  });

  it('returns 403 response when qualification is confirmed (edits locked)', async () => {
    const prisma = makePrisma({ qualificationConfirmed: true });
    const result = await checkQualificationConfirmed(prisma, 'tournament-1') as { status: number; body: unknown };
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('returns 404 response when tournament is not found', async () => {
    const prisma = makePrisma(null);
    const result = await checkQualificationConfirmed(prisma, 'nonexistent-id') as { status: number };
    expect(result).not.toBeNull();
    expect(result.status).toBe(404);
  });

  it('queries the correct tournament by id', async () => {
    const prisma = makePrisma({ qualificationConfirmed: false });
    await checkQualificationConfirmed(prisma, 'my-tournament');
    expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
      where: { id: 'my-tournament' },
      select: { qualificationConfirmed: true },
    });
  });
});
