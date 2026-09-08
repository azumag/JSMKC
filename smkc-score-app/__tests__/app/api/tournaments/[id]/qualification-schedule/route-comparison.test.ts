// @ts-nocheck - route tests use Jest mocks for Prisma delegates and auth sessions

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tournaments/[id]/qualification-schedule/route';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

jest.mock('@/lib/auth');
jest.mock('@/lib/logger');
jest.mock('@/lib/prisma');

describe('GET /api/tournaments/[id]/qualification-schedule comparison evidence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createLogger).mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as ReturnType<typeof createLogger>);
    jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as never);
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
      id: 'tournament-1',
      qualificationScheduleMethod: 'cdm',
    });
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns deterministic circle-versus-CDM evidence for fixture-supported legacy-circle sizes', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/tournaments/tournament-1/qualification-schedule'),
      {
        params: Promise.resolve({ id: 'tournament-1' }),
      },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    const comparisons = json.data.smallGroupCdmComparisons;

    expect(comparisons.map((comparison: { playerCount: number }) => comparison.playerCount)).toEqual([
      7, 8, 9, 10, 11, 12,
    ]);
    expect(comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerCount: 7,
          cdmFixtureCapacity: 8,
          cdmBreakSlotCount: 1,
          realMatchCount: 21,
          pairSetDifferenceCount: 0,
        }),
        expect.objectContaining({
          playerCount: 8,
          cdmFixtureCapacity: 8,
          cdmBreakSlotCount: 0,
          realMatchCount: 28,
          pairSetDifferenceCount: 0,
          byeAssignmentChangedPlayerCount: 0,
        }),
        expect.objectContaining({
          playerCount: 12,
          cdmFixtureCapacity: 12,
          cdmBreakSlotCount: 0,
          realMatchCount: 66,
          pairSetDifferenceCount: 0,
        }),
      ]),
    );
    expect(comparisons.every((comparison: { pairDayChangedCount: number }) => comparison.pairDayChangedCount > 0)).toBe(
      true,
    );
  });
});
