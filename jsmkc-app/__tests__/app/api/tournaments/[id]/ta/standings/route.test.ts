import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    tTEntry: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// Note: standings-cache is mocked via jest.requireMock in tests due to complex mock interactions

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
  })),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import * as standingsRoute from '@/app/api/tournaments/[id]/ta/standings/route';

const logger = createLogger('ta-standings-api-test');

type StandingsCacheMock = {
  get: jest.Mock;
  set: jest.Mock;
  isExpired: jest.Mock;
  generateETag: jest.Mock;
};

const standingsCache = jest.requireMock('@/lib/standings-cache') as StandingsCacheMock;
const { get, set, isExpired, generateETag } = standingsCache;

describe('GET /api/tournaments/[id]/ta/standings', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    });
  });

  describe('Cache Handling', () => {
    it('should return cached data if available and not expired', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const cachedData = {
        data: {
          tournamentId: 't1',
          stage: 'qualification',
          entries: [
            { rank: 1, playerName: 'Player 1', totalTime: 100000 },
          ],
        },
        etag: 'cached-etag',
        expiresAt: new Date(Date.now() + 60000),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ...cachedData.data,
          _cached: true,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'ETag': 'cached-etag',
            'Cache-Control': 'public, max-age=300',
          }),
        })
      );
    });

    it('should skip cache and fetch fresh data if cache is expired', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const cachedData = {
        data: { entries: [] },
        etag: 'old-etag',
        expiresAt: new Date(Date.now() - 1000),
      };

      (get as jest.Mock).mockResolvedValue(cachedData);
      (isExpired as jest.Mock).mockReturnValue(true);

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 100000,
          lives: 3,
          eliminated: false,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
      ];

      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockResolvedValue(undefined);
      (generateETag as jest.Mock).mockReturnValue('new-etag');

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith('t1', 'qualification', mockEntries, 'new-etag');
    });
  });

  describe('Success Cases', () => {
    it('should return TA standings successfully with valid entries', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 100000,
          lives: 3,
          eliminated: false,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
        {
          id: 'entry2',
          rank: null,
          totalTime: null,
          lives: 1,
          eliminated: false,
          playerId: 'p2',
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'player2',
          },
        },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockResolvedValue(undefined);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: { rank: 'asc' },
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: 't1',
          stage: 'qualification',
          entries: expect.arrayContaining([
            expect.objectContaining({
              rank: 1,
              playerName: 'Player 1',
              playerNickname: 'player1',
              totalTime: 100000,
              formattedTime: '1:40',
              lives: 3,
              eliminated: false,
            }),
            expect.objectContaining({
              rank: '-',
              playerName: 'Player 2',
              playerNickname: 'player2',
              totalTime: null,
              formattedTime: '-',
            }),
          ]),
        })
      );
    });

    it('should handle entries with totalTime = 0', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 0,
          lives: 3,
          eliminated: false,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockResolvedValue(undefined);

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              formattedTime: '0:00',
            }),
          ]),
        })
      );
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch TA standings',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to fetch TA standings' },
        { status: 500 }
      );
    });

    it('should handle cache set errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockEntries = [
        {
          id: 'entry1',
          rank: 1,
          totalTime: 100000,
          playerId: 'p1',
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
      ];

      (get as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (set as jest.Mock).mockRejectedValue(new Error('Cache error'));
      (generateETag as jest.Mock).mockReturnValue('new-etag');

      const response = await standingsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta/standings'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalled();
    });
  });
});
