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
        policyMatrix: expect.arrayContaining([
          expect.objectContaining({
            playerCount: 7,
            effectiveMethod: 'circle',
            cdmFixtureCapacity: 8,
            cdmBreakSlotCount: 1,
          }),
          expect.objectContaining({
            playerCount: 13,
            effectiveMethod: 'circle',
            cdmFixtureCapacity: null,
            cdmBreakSlotCount: null,
            nearestLargerCdmFixtureCapacity: 16,
            nearestLargerCdmBreakSlotCount: 3,
          }),
          expect.objectContaining({
            playerCount: 14,
            effectiveMethod: 'cdm',
            cdmFixtureCapacity: 16,
            cdmBreakSlotCount: 2,
          }),
          expect.objectContaining({
            playerCount: 21,
            effectiveMethod: 'cdm',
            generationSupported: false,
            cdmFixtureCapacity: null,
            nearestLargerCdmFixtureCapacity: null,
            nearestLargerCdmBreakSlotCount: null,
          }),
        ]),
        modes: expect.objectContaining({
          bm: [
            expect.objectContaining({
              group: 'A',
              playerCount: 14,
              effectiveMethod: 'cdm',
              reason: 'cdm-requested',
              generationSupported: true,
              cdmFixtureCapacity: 16,
              cdmBreakSlotCount: 2,
            }),
            expect.objectContaining({
              group: 'B',
              playerCount: 13,
              effectiveMethod: 'circle',
              reason: 'cdm-small-group-legacy-circle',
              generationSupported: true,
              cdmFixtureCapacity: null,
              cdmBreakSlotCount: null,
            }),
          ],
        }),
        summary: {
          totalGroupCount: 2,
          legacyCircleGroupCount: 1,
          legacyCirclePlayerCount: 13,
          legacyCircleCdmReadyGroupCount: 0,
          legacyCircleCdmReadyPlayerCount: 0,
          legacyCircleCdmExactFitGroupCount: 0,
          legacyCircleCdmBreakRequiredGroupCount: 0,
          legacyCircleCdmBreakSlotCount: 0,
          legacyCircleCdmUnavailableGroupCount: 1,
          legacyCircleCdmUnavailablePlayerCount: 13,
          legacyCircleSizeBreakdown: [
            {
              playerCount: 13,
              groupCount: 1,
              cdmFixtureCapacity: null,
              cdmBreakSlotCount: null,
            },
          ],
          legacyCircleModeBreakdown: [
            {
              mode: 'bm',
              groupCount: 1,
              playerCount: 13,
              cdmReadyGroupCount: 0,
              cdmReadyPlayerCount: 0,
              cdmExactFitGroupCount: 0,
              cdmBreakRequiredGroupCount: 0,
              cdmBreakSlotCount: 0,
              cdmUnavailableGroupCount: 1,
              cdmUnavailablePlayerCount: 13,
            },
          ],
          cdmFixtureUnavailableGroupCount: 1,
          cdmBreakRequiredGroupCount: 1,
          generationBlockedGroupCount: 0,
        },
      }),
    );
    expect(json.data.policyMatrix).toHaveLength(15);
  });

  it('marks unsupported effective CDM requests as not generation-ready', async () => {
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 21 }, () => ({ group: 'A' })),
    );

    const response = await GET(
      new NextRequest('http://localhost/api/tournaments/tournament-1/qualification-schedule'),
      {
        params: Promise.resolve({ id: 'tournament-1' }),
      },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.modes.bm).toEqual([
      expect.objectContaining({
        group: 'A',
        playerCount: 21,
        effectiveMethod: 'cdm',
        generationSupported: false,
        cdmFixtureCapacity: null,
      }),
    ]);
    expect(json.data.summary).toEqual(
      expect.objectContaining({
        totalGroupCount: 1,
        legacyCirclePlayerCount: 0,
        legacyCircleCdmReadyPlayerCount: 0,
        legacyCircleCdmBreakSlotCount: 0,
        legacyCircleCdmUnavailablePlayerCount: 0,
        cdmFixtureUnavailableGroupCount: 1,
        generationBlockedGroupCount: 1,
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

    const response = await GET(new NextRequest('http://localhost/api/tournaments/missing/qualification-schedule'), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(response.status).toBe(404);
    expect(prisma.bMQualification.findMany).not.toHaveBeenCalled();
  });
});
