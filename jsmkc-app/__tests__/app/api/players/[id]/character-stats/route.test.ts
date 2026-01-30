/**
 * @module Character Stats Route Tests
 *
 * Test suite for the GET /api/players/[id]/character-stats endpoint.
 * This route retrieves per-character usage statistics for a specific player,
 * including match counts, win counts, win rates, and most-used character identification.
 * Character stats are derived from MatchCharacterUsage records and correlated with
 * BM (Battle Mode), MR (Match Race), and GP (Grand Prix) match results to calculate
 * win/loss data.
 *
 * Covers:
 * - Authorization: Admin-only access enforcement (403 for non-admin/unauthenticated)
 * - Data retrieval: Fetching character usages and match data for the player
 * - Statistics calculation: Correct win rates per character, most-used character identification
 * - Error handling: Graceful handling of database errors with structured logging
 * - Empty results: Handling players with no character usage records
 *
 * IMPORTANT: Uses @ts-nocheck and global jest (not @jest/globals).
 * jest.mock factory functions run in the global jest context due to hoisting.
 * Using global jest throughout avoids mock identity mismatches.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// Mock dependencies

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// Logger mock: stable reference to shared logger instance so tests can
// verify logger calls even after clearAllMocks resets call history.
const mockLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => mockLoggerInstance),
}));

// Custom next/server mock matching the pattern used in working tournament tests.
jest.mock('next/server', () => {
  const mockJson = jest.fn();
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this._body = init.body;
      const h = init.headers || {};
      this.headers = {
        get: (key) => {
          if (h instanceof Headers) return h.get(key);
          if (h instanceof Map) return h.get(key);
          return h[key] || null;
        },
        forEach: (cb) => {
          if (h instanceof Headers) { h.forEach(cb); return; }
          Object.entries(h).forEach(([k, v]) => cb(v, k));
        },
      };
    }
    async json() {
      if (typeof this._body === 'string') return JSON.parse(this._body);
      return this._body;
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import * as characterStatsRoute from '@/app/api/players/[id]/character-stats/route';

const loggerMock = jest.requireMock('@/lib/logger');

describe('GET /api/players/[id]/character-stats', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire createLogger after clearAllMocks clears call history.
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
    // Set up default admin auth for most tests
    auth.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      auth.mockResolvedValue(null);

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
      auth.mockResolvedValue({
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
      prisma.matchCharacterUsage.findMany.mockResolvedValue([]);

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

      prisma.matchCharacterUsage.findMany.mockResolvedValue(mockUsages);
      prisma.bMMatch.findMany.mockResolvedValue([
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

      prisma.matchCharacterUsage.findMany.mockResolvedValue(mockUsages);
      prisma.bMMatch.findMany.mockResolvedValue([
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

      prisma.matchCharacterUsage.findMany.mockResolvedValue(mockUsages);
      prisma.bMMatch.findMany.mockResolvedValue([
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

      const callArgs = NextResponse.json.mock.calls[0];
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

      prisma.matchCharacterUsage.findMany.mockResolvedValue(mockUsages);
      prisma.bMMatch.findMany.mockResolvedValue([]);

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      const callArgs = NextResponse.json.mock.calls[0];
      expect(callArgs[0].mostUsedCharacter).toBe('Mario');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      prisma.matchCharacterUsage.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await characterStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/players/p1/character-stats'),
        { params: Promise.resolve({ id: 'p1' }) }
      );

      // Verify the shared logger instance received the error call
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
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
      prisma.matchCharacterUsage.findMany.mockResolvedValue([]);

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
