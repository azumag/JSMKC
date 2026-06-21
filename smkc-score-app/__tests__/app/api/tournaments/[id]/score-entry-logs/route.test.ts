/**
 * @module Score Entry Logs Route Tests
 *
 * Test suite for the GET /api/tournaments/[id]/score-entry-logs endpoint.
 * This route retrieves score entry log records for a specific tournament,
 * providing an audit trail of all score submissions and modifications.
 *
 * Covers:
 * - Authorization: Returns 403 when user is not authenticated or not admin
 * - Error handling: Database connection failures with tournament ID included in error logs
 * - Structured logging: Verifies that error messages include relevant context (tournamentId, error)
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes
// NOTE: Do NOT import jest from @jest/globals here. The jest.mock factory uses
// the global jest.fn(), and mixing @jest/globals jest with global jest causes
// mock functions created by one to not be recognized by the other.
import { NextRequest } from 'next/server';

// Mock dependencies

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// Mock logger so createLogger returns objects with trackable mock methods.
// The mock logger is created inside the factory because jest.mock() is hoisted
// above variable declarations, making external references unavailable at factory
// execution time.
jest.mock('@/lib/logger', () => {
  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => logger),
  };
});

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import * as scoreEntryLogsRoute from '@/app/api/tournaments/[id]/score-entry-logs/route';

describe('GET /api/tournaments/[id]/score-entry-logs', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    /**
     * When auth() returns null (no session), the route returns 401 immediately
     * without reaching the try/catch block. No error logging occurs in this path.
     */
    it('should return 401 when not authenticated', async () => {
      jest.mocked(auth).mockResolvedValue(null);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // handleAuthError returns 401 UNAUTHORIZED for unauthenticated requests
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
        }),
        { status: 401 }
      );
    });

    /**
     * TC-2506: player role session is rejected with 403.
     * score-entry-logs is admin-only; non-admin authenticated users must be forbidden.
     * The authorization check must short-circuit before any DB query is executed.
     */
    it('TC-2506: should return 403 when authenticated as player role', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'player-1', role: 'player' },
      });

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // handleAuthzError returns 403 FORBIDDEN for non-admin users
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'FORBIDDEN',
        }),
        { status: 403 }
      );
      // Verify the authorization check short-circuits before any DB query (#2529)
      expect(jest.mocked(prisma.scoreEntryLog.findMany)).not.toHaveBeenCalled();
    });

    /**
     * When auth succeeds but the database query throws, the catch block
     * logs the error with the tournament ID for debugging and returns 500.
     */
    it('should include tournament ID in error logging', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      jest.mocked(prisma.scoreEntryLog.findMany).mockRejectedValue(
        new Error('Database connection failed')
      );

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // Access the mock logger via requireMock because the logger instance
      // is created inside the jest.mock factory (hoisted above variable scope).
      const { createLogger } = jest.requireMock('@/lib/logger') as {
        createLogger: jest.Mock;
      };
      // createLogger returns the same mock logger object each time
      const logger = createLogger();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch score entry logs',
        expect.objectContaining({
          tournamentId: 't1',
          error: expect.any(Error),
        })
      );
    });
  });

  describe('Success', () => {
    /**
     * TC-2507: admin session returns logs grouped by matchId.
     * Multiple logs for the same match must be coalesced under the same key.
     */
    it('TC-2507: should return logs grouped by matchId for admin session', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const fakeLogs = [
        {
          id: 'log-1',
          matchId: 'match-A',
          tournamentId: 't1',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          player: { id: 'p1', name: 'Alice', nickname: 'ali' },
        },
        {
          id: 'log-2',
          matchId: 'match-A',
          tournamentId: 't1',
          timestamp: new Date('2024-01-01T10:05:00Z'),
          player: { id: 'p2', name: 'Bob', nickname: 'bob' },
        },
        {
          id: 'log-3',
          matchId: 'match-B',
          tournamentId: 't1',
          timestamp: new Date('2024-01-01T11:00:00Z'),
          player: { id: 'p1', name: 'Alice', nickname: 'ali' },
        },
      ];
      jest.mocked(prisma.scoreEntryLog.findMany).mockResolvedValue(fakeLogs);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // createSuccessResponse calls NextResponse.json(body) without status for 200
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            tournamentId: 't1',
            totalCount: 3,
            logsByMatch: expect.objectContaining({
              'match-A': expect.arrayContaining([
                expect.objectContaining({ id: 'log-1' }),
                expect.objectContaining({ id: 'log-2' }),
              ]),
              'match-B': expect.arrayContaining([
                expect.objectContaining({ id: 'log-3' }),
              ]),
            }),
          }),
        })
      );
    });
  });
});
