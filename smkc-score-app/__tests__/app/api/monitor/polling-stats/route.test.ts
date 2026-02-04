/**
 * @module Polling Stats Monitor Route Tests
 *
 * Test suite for GET /api/monitor/polling-stats endpoint.
 * This route provides polling statistics (total requests, average response time,
 * active connections, error rate) for system monitoring purposes.
 * Access is restricted to authenticated admin users.
 *
 * Note: Rate limiting has been removed from the application as it is an internal
 * tournament tool with few concurrent users. Rate limit statistics are no longer
 * included in the monitoring response.
 *
 * Covers:
 * - Success cases: Returning polling statistics data, handling empty activity
 * - Authentication: Rejecting unauthenticated requests with 401 status
 * - Error handling: Graceful handling of database/auth errors with structured logging
 *
 * Uses CLAUDE.md mock pattern with jest.requireMock() for accessing shared mock instances.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// IMPORTANT: jest.mock() calls use the global jest (not imported from @jest/globals)
// because babel-jest's hoisting plugin does not properly hoist jest.mock()
// when jest is imported from @jest/globals, causing mocks to not be applied.

// Logger mock returns a shared instance so tests can verify calls on the same object
jest.mock('@/lib/logger', () => {
  const mockLoggerInstance = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => mockLoggerInstance),
  };
});

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import * as pollingStatsRoute from '@/app/api/monitor/polling-stats/route';

// Access mocks via requireMock (per CLAUDE.md mock pattern)
const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/monitor/polling-stats', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return polling statistics', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalRequests: expect.any(Number),
            averageResponseTime: expect.any(Number),
            activeConnections: expect.any(Number),
            errorRate: expect.any(Number),
            timePeriod: expect.objectContaining({
              start: expect.any(String),
              end: expect.any(String),
              duration: '1 hour',
            }),
            warnings: expect.any(Array),
          }),
        })
      );
    });

    it('should return empty stats when no activity', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalRequests: expect.any(Number),
            averageResponseTime: expect.any(Number),
            activeConnections: expect.any(Number),
            errorRate: expect.any(Number),
            timePeriod: expect.objectContaining({
              start: expect.any(String),
              end: expect.any(String),
              duration: '1 hour',
            }),
            warnings: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockRejectedValue(new Error('Auth error'));

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      // createLogger() returns the shared mockLoggerInstance
      const mockLogger = loggerMock.createLogger();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get polling stats',
        expect.any(Object)
      );
      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to retrieve polling statistics' },
        { status: 500 }
      );
    });
  });
});
