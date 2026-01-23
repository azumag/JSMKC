// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    scoreEntryLog: {
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
import * as scoreEntryLogsRoute from '@/app/api/tournaments/[id]/score-entry-logs/route';

const logger = createLogger('score-entry-logs-test');

describe('GET /api/tournaments/[id]/score-entry-logs', () => {
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

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should return score entry logs for tournament', async () => {
      const mockLogs = [
        {
          id: 'log1',
          tournamentId: 't1',
          matchId: 'm1',
          playerId: 'p1',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          score: 100,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'p1',
          },
        },
        {
          id: 'log2',
          tournamentId: 't1',
          matchId: 'm2',
          playerId: 'p2',
          timestamp: new Date('2024-01-15T11:00:00Z'),
          score: 85,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'p2',
          },
        },
      ];

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.scoreEntryLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.scoreEntryLog.findMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 't1',
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              nickname: true,
            },
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: 't1',
          logsByMatch: expect.any(Object),
          totalCount: 2,
        })
      );
    });

    it('should group logs by match ID', async () => {
      const mockLogs = [
        {
          id: 'log1',
          tournamentId: 't1',
          matchId: 'm1',
          playerId: 'p1',
          timestamp: new Date(),
          score: 100,
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'log2',
          tournamentId: 't1',
          matchId: 'm1',
          playerId: 'p2',
          timestamp: new Date(),
          score: 95,
          player: { id: 'p2', name: 'Player 2', nickname: 'p2' },
        },
        {
          id: 'log3',
          tournamentId: 't1',
          matchId: 'm2',
          playerId: 'p3',
          timestamp: new Date(),
          score: 90,
          player: { id: 'p3', name: 'Player 3', nickname: 'p3' },
        },
      ];

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.scoreEntryLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse.json as jest.Mock).mock.calls.find(
        (call) => call[0]?.logsByMatch !== undefined
      );

      expect(responseCall).toBeDefined();
      const logsByMatch = responseCall[0].logsByMatch;

      // Should have two match groups
      expect(Object.keys(logsByMatch)).toHaveLength(2);
      expect(logsByMatch['m1']).toHaveLength(2); // Two logs for match m1
      expect(logsByMatch['m2']).toHaveLength(1); // One log for match m2
    });

    it('should return empty logs when no logs exist', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.scoreEntryLog.findMany as jest.Mock).mockResolvedValue([]);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: 't1',
          logsByMatch: {},
          totalCount: 0,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.scoreEntryLog.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch score entry logs',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch score entry logs',
        }),
        { status: 500 }
      );
    });

    it('should include tournament ID in error logging', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.scoreEntryLog.findMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch score entry logs',
        expect.objectContaining({
          tournamentId: 't1',
          error: expect.any(Error),
        })
      );
    });
  });
});
