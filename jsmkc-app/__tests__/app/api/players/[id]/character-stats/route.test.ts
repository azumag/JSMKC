// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    matchCharacterUsage: {
      findMany: jest.fn(),
    },
    bMMatch: {
      findMany: jest.fn(),
    },
    mRMatch: {
      findMany: jest.fn(),
    },
    gPMatch: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
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
import * as characterStatsRoute from '@/app/api/players/[id]/character-stats/route';

const logger = createLogger('character-stats-test');

// Cast mocks to proper types
const mockAuth = auth as any;

describe('GET /api/players/[id]/character-stats', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default mock behaviors
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should allow access for admin users', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.matchCharacterUsage.findMany as jest.Mock).mockResolvedValue([]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(prisma.matchCharacterUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: 'p1' },
        })
      );
    });
  });

  describe('Data Retrieval', () => {
    it('should fetch character usages for the player', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockUsages = [
        {
          id: 'u1',
          playerId: 'p1',
          matchId: 'm1',
          matchType: 'BM',
          character: 'Mario',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'u2',
          playerId: 'p1',
          matchId: 'm2',
          matchType: 'BM',
          character: 'Luigi',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
      ];

      (prisma.matchCharacterUsage.findMany as jest.Mock).mockResolvedValue(mockUsages);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([
        { id: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 3, score2: 1, completed: true },
        { id: 'm2', player1Id: 'p2', player2Id: 'p1', score1: 0, score2: 4, completed: true },
      ]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(prisma.matchCharacterUsage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: 'p1' },
          include: { player: true },
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should query BM matches when BM match type is present', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockUsages = [
        {
          id: 'u1',
          playerId: 'p1',
          matchId: 'm1',
          matchType: 'BM',
          character: 'Mario',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
      ];

      (prisma.matchCharacterUsage.findMany as jest.Mock).mockResolvedValue(mockUsages);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([
        { id: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 3, score2: 1, completed: true },
      ]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['m1'] } },
        })
      );
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate correct win rates for characters', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockUsages = [
        {
          id: 'u1',
          playerId: 'p1',
          matchId: 'm1',
          matchType: 'BM',
          character: 'Mario',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'u2',
          playerId: 'p1',
          matchId: 'm2',
          matchType: 'BM',
          character: 'Mario',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'u3',
          playerId: 'p1',
          matchId: 'm3',
          matchType: 'BM',
          character: 'Luigi',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
      ];

      (prisma.matchCharacterUsage.findMany as jest.Mock).mockResolvedValue(mockUsages);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([
        { id: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 3, score2: 1, completed: true }, // Mario win
        { id: 'm2', player1Id: 'p2', player2Id: 'p1', score1: 0, score2: 4, completed: true }, // Mario win
        { id: 'm3', player1Id: 'p1', player2Id: 'p2', score1: 1, score2: 3, completed: true }, // Luigi loss
      ]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: 'p1',
          playerName: 'Player 1',
          playerNickname: 'p1',
          totalMatches: 3,
          characterStats: expect.any(Array),
        })
      );

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      const characterStats = callArgs[0].characterStats;

      // Mario should have 2 wins out of 2 matches (100%)
      const marioStats = characterStats.find(s => s.character === 'Mario');
      expect(marioStats).toBeDefined();
      expect(marioStats.matchCount).toBe(2);
      expect(marioStats.winCount).toBe(2);
      expect(marioStats.winRate).toBe(1);

      // Luigi should have 0 wins out of 1 match (0%)
      const luigiStats = characterStats.find(s => s.character === 'Luigi');
      expect(luigiStats).toBeDefined();
      expect(luigiStats.matchCount).toBe(1);
      expect(luigiStats.winCount).toBe(0);
      expect(luigiStats.winRate).toBe(0);
    });

    it('should identify most used character', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const mockUsages = [
        {
          id: 'u1',
          playerId: 'p1',
          matchId: 'm1',
          matchType: 'BM',
          character: 'Mario',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'u2',
          playerId: 'p1',
          matchId: 'm2',
          matchType: 'BM',
          character: 'Mario',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'u3',
          playerId: 'p1',
          matchId: 'm3',
          matchType: 'BM',
          character: 'Luigi',
          createdAt: new Date(),
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
      ];

      (prisma.matchCharacterUsage.findMany as jest.Mock).mockResolvedValue(mockUsages);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs[0].mostUsedCharacter).toBe('Mario');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.matchCharacterUsage.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch character stats',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch character stats',
        }),
        { status: 500 }
      );
    });
  });

  describe('Empty Results', () => {
    it('should handle player with no character usages', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.matchCharacterUsage.findMany as jest.Mock).mockResolvedValue([]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: 'p1',
          playerName: undefined,
          playerNickname: undefined,
          totalMatches: 0,
          characterStats: [],
          mostUsedCharacter: null,
          characterUsage: [],
        })
      );
    });
  });
});
