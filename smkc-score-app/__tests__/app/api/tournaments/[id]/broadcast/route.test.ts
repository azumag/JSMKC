/**
 * Unit tests for GET/PUT /api/tournaments/[id]/broadcast.
 *
 * GET: public — returns overlay player names and match info
 * PUT: admin only — updates overlay fields; validates types/lengths; returns 403 for non-admin
 */

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options) => ({ data, status: options?.status ?? 200 })),
  },
  NextRequest: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data: unknown) => data),
}));

jest.mock('@/lib/tournament-identifier', () => ({
  resolveTournament: jest.fn(),
}));

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { resolveTournament } from '@/lib/tournament-identifier';
import { GET, PUT } from '@/app/api/tournaments/[id]/broadcast/route';

const mockParams = (id: string) => ({ params: Promise.resolve({ id }) });
const mockReq = (body?: unknown) =>
  ({
    json: () => Promise.resolve(body ?? {}),
  }) as unknown as Request;

const mockResolveTournament = resolveTournament as jest.Mock;

describe('GET /api/tournaments/[id]/broadcast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns broadcast shape with empty defaults when fields are null', async () => {
    mockResolveTournament.mockResolvedValue({
      overlayPlayer1Name: null,
      overlayPlayer2Name: null,
      overlayMatchLabel: null,
      overlayPlayer1Wins: null,
      overlayPlayer2Wins: null,
      overlayMatchFt: null,
    });

    await GET({} as Request, mockParams('t1'));

    expect(NextResponse.json).toHaveBeenCalledWith({
      success: true,
      data: {
        player1Name: '',
        player2Name: '',
        matchLabel: null,
        player1Wins: null,
        player2Wins: null,
        matchFt: null,
      },
    });
  });

  it('returns persisted broadcast values', async () => {
    mockResolveTournament.mockResolvedValue({
      overlayPlayer1Name: 'Alice',
      overlayPlayer2Name: 'Bob',
      overlayMatchLabel: 'QF1',
      overlayPlayer1Wins: 2,
      overlayPlayer2Wins: 1,
      overlayMatchFt: 5,
    });

    await GET({} as Request, mockParams('t1'));

    expect(NextResponse.json).toHaveBeenCalledWith({
      success: true,
      data: {
        player1Name: 'Alice',
        player2Name: 'Bob',
        matchLabel: 'QF1',
        player1Wins: 2,
        player2Wins: 1,
        matchFt: 5,
      },
    });
  });

  it('returns 404 when tournament not found', async () => {
    mockResolveTournament.mockResolvedValue(null);

    await GET({} as Request, mockParams('nonexistent'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(404);
  });
});

describe('PUT /api/tournaments/[id]/broadcast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockResolveTournament.mockResolvedValue({ id: 't1' });
    (prisma.tournament.update as jest.Mock).mockResolvedValue({});
  });

  it('updates player names and match info for admin', async () => {
    await PUT(
      mockReq({ player1Name: 'Alice', player2Name: 'Bob', matchLabel: 'QF1', player1Wins: 2, player2Wins: 1, matchFt: 5 }),
      mockParams('t1'),
    );

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overlayPlayer1Name: 'Alice',
          overlayPlayer2Name: 'Bob',
          overlayMatchLabel: 'QF1',
          overlayPlayer1Wins: 2,
          overlayPlayer2Wins: 1,
          overlayMatchFt: 5,
        }),
      }),
    );
    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status ?? 200).toBe(200);
  });

  it('clears a field when null is passed', async () => {
    await PUT(
      mockReq({ matchLabel: null }),
      mockParams('t1'),
    );

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overlayMatchLabel: null }),
      }),
    );
  });

  it('trims whitespace from player names', async () => {
    await PUT(
      mockReq({ player1Name: '  Alice  ' }),
      mockParams('t1'),
    );

    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overlayPlayer1Name: 'Alice' }),
      }),
    );
  });

  it('returns 403 for unauthenticated request', async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    await PUT(mockReq({ player1Name: 'X' }), mockParams('t1'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(403);
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin (player role)', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'p1', role: 'player' } });

    await PUT(mockReq({ player1Name: 'X' }), mockParams('t1'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(403);
  });

  it('returns 400 when body is empty (no fields provided)', async () => {
    await PUT(mockReq({}), mockParams('t1'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(400);
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it('returns 400 when player1Name exceeds 50 characters', async () => {
    await PUT(mockReq({ player1Name: 'A'.repeat(51) }), mockParams('t1'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(400);
  });

  it('returns 400 when player1Name is not a string', async () => {
    await PUT(mockReq({ player1Name: 123 }), mockParams('t1'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(400);
  });

  it('returns 400 when matchFt is not a number', async () => {
    await PUT(mockReq({ matchFt: 'five' }), mockParams('t1'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(400);
  });

  it('returns 404 when tournament not found', async () => {
    mockResolveTournament.mockResolvedValue(null);

    await PUT(mockReq({ player1Name: 'Alice' }), mockParams('nonexistent'));

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(404);
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });
});
