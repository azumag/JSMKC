/**
 * Focused regression coverage for broadcast numeric input validation.
 *
 * Overlay score state is persisted as integers, so values outside JavaScript's
 * safe-integer range must fail closed instead of being rounded before storage.
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

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { resolveTournament } from '@/lib/tournament-identifier';
import { PUT } from '@/app/api/tournaments/[id]/broadcast/route';

const mockParams = { params: Promise.resolve({ id: 't1' }) };
const mockReq = (body: unknown) =>
  ({
    json: () => Promise.resolve(body),
  }) as unknown as NextRequest;

const mockResolveTournament = resolveTournament as jest.Mock;

describe('PUT /api/tournaments/[id]/broadcast safe integer validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockResolveTournament.mockResolvedValue({ id: 't1' });
    (prisma.tournament.update as jest.Mock).mockResolvedValue({});
  });

  it.each(['player1Wins', 'player2Wins', 'matchFt'])('rejects an unsafe integer for %s', async (field) => {
    await PUT(mockReq({ [field]: Number.MAX_SAFE_INTEGER + 1 }), mockParams);

    expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status).toBe(400);
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });

  it.each(['player1Wins', 'player2Wins', 'matchFt'])(
    'still accepts a non-negative safe integer for %s',
    async (field) => {
      await PUT(mockReq({ [field]: 42 }), mockParams);

      expect((NextResponse.json as jest.Mock).mock.calls[0][1]?.status ?? 200).toBe(200);
      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            [`overlay${field[0].toUpperCase()}${field.slice(1)}`]: 42,
          }),
        }),
      );
    },
  );
});
