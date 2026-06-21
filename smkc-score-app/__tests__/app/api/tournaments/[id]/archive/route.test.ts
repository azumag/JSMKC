/**
 * Unit tests for GET/POST /api/tournaments/[id]/archive.
 *
 * GET /api/tournaments/[id]/archive:
 * - Returns 404 when no archive exists (TC-2473)
 * - Returns 403 when archive exists but publicModes is empty (TC-2472)
 * - Returns archive bundle when publicModes has entries
 *
 * POST /api/tournaments/[id]/archive:
 * - Returns 401 when not authenticated (TC-2475)
 * - Returns 403 when authenticated but not admin (TC-2475)
 * - Returns 404 when tournament not found
 * - Returns 409 when tournament is not completed (TC-2474)
 * - Returns generated archive on success
 * - Returns 500 and logs error when persistTournamentArchive throws
 */
// Logger factory is hoisted, so the shared instance must live inside the factory.
// Retrieve it later via jest.requireMock('@/lib/logger').createLogger().
jest.mock('@/lib/logger', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { createLogger: jest.fn(() => logger) };
});

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: unknown, options?: { status?: number }) => ({ data, status: options?.status ?? 200 })),
  },
  NextRequest: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/tournament-identifier', () => ({
  resolveTournament: jest.fn(),
}));

jest.mock('@/lib/tournament-archive', () => ({
  readTournamentArchive: jest.fn(),
  persistTournamentArchive: jest.fn(),
}));

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveTournament } from '@/lib/tournament-identifier';
import { readTournamentArchive, persistTournamentArchive, type TournamentArchiveBundle } from '@/lib/tournament-archive';
import { GET, POST } from '@/app/api/tournaments/[id]/archive/route';

const mockParams = (id: string) => ({ params: Promise.resolve({ id }) });
const mockReq = () => ({} as unknown as NextRequest);

const mockAuth = auth as jest.Mock; // next-auth type via NextAuth(config as any) makes jest.mocked() infer 'never'
const mockResolveTournament = jest.mocked(resolveTournament);
const mockReadTournamentArchive = jest.mocked(readTournamentArchive);
const mockPersistTournamentArchive = jest.mocked(persistTournamentArchive);

function makeArchiveBundle(publicModes: string[]) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    tournament: {
      id: 'tournament-1',
      slug: 'jsmkc2026',
      name: 'JSMKC 2026',
      date: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      publicModes,
      frozenStages: [],
      taPlayerSelfEdit: false,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    allPlayers: [],
    modes: { ta: { entries: [], phaseRounds: [] }, bm: {}, mr: {}, gp: {} },
    overallRanking: { rankings: [] },
    archived: true,
  } as unknown as TournamentArchiveBundle;
}

describe('GET /api/tournaments/[id]/archive', () => {
  beforeEach(() => jest.clearAllMocks());

  // TC-2473
  it('returns 404 when archive does not exist', async () => {
    mockReadTournamentArchive.mockResolvedValue(null);

    await GET(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'NOT_FOUND' }),
      { status: 404 }
    );
  });

  // TC-2472
  it('returns 403 when publicModes is empty (private archived tournament)', async () => {
    mockReadTournamentArchive.mockResolvedValue(makeArchiveBundle([]));

    await GET(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'FORBIDDEN' }),
      { status: 403 }
    );
  });

  it('returns archive bundle when publicModes has entries', async () => {
    const bundle = makeArchiveBundle(['ta', 'bm', 'overall']);
    mockReadTournamentArchive.mockResolvedValue(bundle);

    await GET(mockReq(), mockParams('tournament-1'));

    // createSuccessResponse calls NextResponse.json(body) without status for 200
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: bundle })
    );
  });

  it('returns 403 when publicModes is null (null || [] coerces to empty array)', async () => {
    const bundle = makeArchiveBundle([]);
    // Simulate a DB row where publicModes was never set (NULL in D1)
    (bundle.tournament as any).publicModes = null;
    mockReadTournamentArchive.mockResolvedValue(bundle);

    await GET(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'FORBIDDEN' }),
      { status: 403 }
    );
  });

  // The GET handler has no try-catch: R2 read errors propagate to Next.js's error boundary.
  it('propagates readTournamentArchive errors (GET has no try-catch)', async () => {
    mockReadTournamentArchive.mockRejectedValue(new Error('R2 read failed'));

    await expect(GET(mockReq(), mockParams('tournament-1'))).rejects.toThrow('R2 read failed');
  });
});

describe('POST /api/tournaments/[id]/archive', () => {
  beforeEach(() => jest.clearAllMocks());

  // TC-2475 — unauthenticated
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await POST(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'UNAUTHORIZED' }),
      { status: 401 }
    );
  });

  // TC-2475 — authenticated but not admin
  it('returns 403 when authenticated as non-admin (player role)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'player-1', role: 'player' } });

    await POST(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'FORBIDDEN' }),
      { status: 403 }
    );
  });

  it('returns 404 when tournament not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockResolveTournament.mockResolvedValue(null);

    await POST(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'NOT_FOUND' }),
      { status: 404 }
    );
  });

  // TC-2474
  it('returns 409 when tournament is not completed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockResolveTournament.mockResolvedValue({ id: 'tournament-1', status: 'active' });

    await POST(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'CONFLICT' }),
      { status: 409 }
    );
  });

  it('returns the generated archive bundle on success', async () => {
    const bundle = makeArchiveBundle(['ta', 'bm', 'overall']);
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockResolveTournament.mockResolvedValue({ id: 'tournament-1', status: 'completed' });
    mockPersistTournamentArchive.mockResolvedValue(bundle);

    await POST(mockReq(), mockParams('tournament-1'));

    expect(mockPersistTournamentArchive).toHaveBeenCalledWith('tournament-1');
    // createSuccessResponse calls NextResponse.json(body) without status for 200
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: bundle })
    );
  });

  it('returns 500 and logs error when persistTournamentArchive throws', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockResolveTournament.mockResolvedValue({ id: 'tournament-1', status: 'completed' });
    mockPersistTournamentArchive.mockRejectedValue(new Error('R2 write failed'));

    await POST(mockReq(), mockParams('tournament-1'));

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'INTERNAL_ERROR' }),
      { status: 500 }
    );
    const { createLogger } = jest.requireMock('@/lib/logger');
    const logger = createLogger();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to persist tournament archive',
      expect.objectContaining({ tournamentId: 'tournament-1', error: expect.any(Error) })
    );
  });
});
