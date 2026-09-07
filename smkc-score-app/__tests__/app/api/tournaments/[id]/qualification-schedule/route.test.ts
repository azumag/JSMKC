// @ts-nocheck - route tests use Jest mocks for Prisma delegates and auth sessions

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tournaments/[id]/qualification-schedule/route';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

jest.mock('@/lib/auth');
jest.mock('@/lib/logger');
jest.mock('@/lib/prisma');

describe('GET /api/tournaments/[id]/qualification-schedule', () => {
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createLogger).mockReturnValue(logger as ReturnType<typeof createLogger>);
    jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as never);
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
      id: 'tournament-1',
      qualificationScheduleMethod: 'cdm',
    });
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([
      ...Array.from({ length: 14 }, () => ({ group: 'A' })),
      ...Array.from({ length: 13 }, () => ({ group: 'B' })),
    ]);
    (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns configured and effective schedule policy for populated groups', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/tournaments/tournament-1/qualification-schedule'),
      {
        params: Promise.resolve({ id: 'tournament-1' }),
      },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(
      expect.objectContaining({
        tournamentId: 'tournament-1',
        configuredMethod: 'cdm',
        modes: expect.objectContaining({
          bm: [
            expect.objectContaining({
              group: 'A',
              playerCount: 14,
              effectiveMethod: 'cdm',
              reason: 'cdm-requested',
            }),
            expect.objectContaining({
              group: 'B',
              playerCount: 13,
              effectiveMethod: 'circle',
              reason: 'cdm-small-group-legacy-circle',
            }),
          ],
        }),
      }),
    );
  });

  it('rejects non-admin users before reading tournament data', async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: 'player-1', role: 'player' } } as never);

    const response = await GET(
      new NextRequest('http://localhost/api/tournaments/tournament-1/qualification-schedule'),
      {
        params: Promise.resolve({ id: 'tournament-1' }),
      },
    );

    expect(response.status).toBe(403);
    expect(prisma.tournament.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown tournaments', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/tournaments/missing/qualification-schedule'),
      {
        params: Promise.resolve({ id: 'missing' }),
      },
    );

    expect(response.status).toBe(404);
    expect(prisma.bMQualification.findMany).not.toHaveBeenCalled();
  });
});
