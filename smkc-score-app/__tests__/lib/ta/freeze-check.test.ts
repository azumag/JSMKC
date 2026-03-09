/**
 * Tests for freeze-check: checkStageFrozen
 *
 * The freeze mechanism prevents time edits after a phase completes.
 * Tournament.frozenStages stores a JSON array of locked stage names.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({ body, status: init?.status ?? 200 })),
  },
}));

import { checkStageFrozen } from '@/lib/ta/freeze-check';

const { NextResponse } = jest.requireMock('next/server');

/** Build a minimal Prisma mock with configurable tournament.findUnique */
function makePrisma(tournament: { frozenStages?: unknown } | null) {
  return {
    tournament: {
      findUnique: jest.fn().mockResolvedValue(tournament),
    },
  } as unknown as Parameters<typeof checkStageFrozen>[0];
}

describe('checkStageFrozen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when stage is not frozen', async () => {
    const prisma = makePrisma({ frozenStages: ['phase1'] });

    const result = await checkStageFrozen(prisma, 'tournament-1', 'phase2');

    expect(result).toBeNull();
  });

  it('returns null when frozenStages is empty', async () => {
    const prisma = makePrisma({ frozenStages: [] });

    const result = await checkStageFrozen(prisma, 'tournament-1', 'phase1');

    expect(result).toBeNull();
  });

  it('returns null when frozenStages is null/missing', async () => {
    const prisma = makePrisma({ frozenStages: null });

    const result = await checkStageFrozen(prisma, 'tournament-1', 'phase1');

    expect(result).toBeNull();
  });

  it('returns 403 when stage is frozen', async () => {
    const prisma = makePrisma({ frozenStages: ['phase1', 'phase2'] });

    const result = await checkStageFrozen(prisma, 'tournament-1', 'phase1');

    expect(result).not.toBeNull();
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('phase1') }),
      { status: 403 },
    );
  });

  it('returns 403 for exact match only (does not fuzzy match stage names)', async () => {
    const prisma = makePrisma({ frozenStages: ['phase1'] });

    // "phase" is a substring of "phase1" but should not match
    const result = await checkStageFrozen(prisma, 'tournament-1', 'phase');

    expect(result).toBeNull();
  });

  it('returns 403 for qualification stage when frozen', async () => {
    const prisma = makePrisma({ frozenStages: ['qualification'] });

    const result = await checkStageFrozen(prisma, 'tournament-1', 'qualification');

    expect(result).not.toBeNull();
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
      { status: 403 },
    );
  });

  it('returns 404 when tournament is not found', async () => {
    const prisma = makePrisma(null);

    const result = await checkStageFrozen(prisma, 'nonexistent', 'phase1');

    expect(result).not.toBeNull();
    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: 'Tournament not found' },
      { status: 404 },
    );
  });

  it('queries by correct tournament ID', async () => {
    const prisma = makePrisma({ frozenStages: [] });

    await checkStageFrozen(prisma, 'my-tournament', 'phase3');

    expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
      where: { id: 'my-tournament' },
      select: { frozenStages: true },
    });
  });
});
