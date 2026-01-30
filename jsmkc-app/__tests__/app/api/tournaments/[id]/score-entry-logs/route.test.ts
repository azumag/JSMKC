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
     * When auth() returns null (no session), the route returns 403 immediately
     * without reaching the try/catch block. No error logging occurs in this path.
     */
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // The source returns 403 for unauthenticated/non-admin users
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    });

    /**
     * When auth succeeds but the database query throws, the catch block
     * logs the error with the tournament ID for debugging and returns 500.
     */
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
});
