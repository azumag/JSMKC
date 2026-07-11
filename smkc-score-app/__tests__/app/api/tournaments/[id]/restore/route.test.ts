import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/tournament-archive', () => ({ readTournamentArchive: jest.fn() }));
jest.mock('@/lib/tournament-archive-restore', () => ({ restoreTournamentArchiveForReopen: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() })),
}));

import { auth } from '@/lib/auth';
import { readTournamentArchive } from '@/lib/tournament-archive';
import { restoreTournamentArchiveForReopen } from '@/lib/tournament-archive-restore';
import { POST } from '@/app/api/tournaments/[id]/restore/route';

const archive = {
  tournament: { id: 'archived-1', status: 'completed' },
};

describe('POST /api/tournaments/[id]/restore', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    jest.mocked(readTournamentArchive).mockResolvedValue(archive as never);
    jest.mocked(restoreTournamentArchiveForReopen).mockResolvedValue({
      tournament: { id: 'archived-1', status: 'active', publicModes: [] },
      restoredPlayerCount: 1,
      reusedPlayerCount: 2,
    } as never);
  });

  it('restores a completed archive as an active tournament', async () => {
    await POST(new NextRequest('http://localhost/api/tournaments/archived-1/restore', { method: 'POST' }), {
      params: Promise.resolve({ id: 'archived-1' }),
    });

    expect(readTournamentArchive).toHaveBeenCalledWith('archived-1');
    expect(restoreTournamentArchiveForReopen).toHaveBeenCalledWith(archive);
    expect(NextResponse.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'archived-1', status: 'active', publicModes: [] },
    });
  });

  it('returns 404 when no archive exists', async () => {
    jest.mocked(readTournamentArchive).mockResolvedValue(null);

    await POST(new NextRequest('http://localhost/api/tournaments/missing/restore', { method: 'POST' }), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'NOT_FOUND' }), {
      status: 404,
    });
  });

  it('reports the failed restore stage to the admin caller', async () => {
    jest
      .mocked(restoreTournamentArchiveForReopen)
      .mockRejectedValue(Object.assign(new Error('too many SQL variables'), { restoreStage: 'BM matches' }));

    await POST(new NextRequest('http://localhost/api/tournaments/archived-1/restore', { method: 'POST' }), {
      params: Promise.resolve({ id: 'archived-1' }),
    });

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Failed to restore tournament archive (BM matches)' }),
      { status: 500 },
    );
  });

  it('rejects non-admin callers', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'member-1', role: 'member' } });

    await POST(new NextRequest('http://localhost/api/tournaments/archived-1/restore', { method: 'POST' }), {
      params: Promise.resolve({ id: 'archived-1' }),
    });

    expect(readTournamentArchive).not.toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }), { status: 403 });
  });
});
