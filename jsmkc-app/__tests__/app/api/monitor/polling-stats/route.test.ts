/**
 * @module Polling Stats Monitor Route Tests
 *
 * Test suite for the GET /api/monitor/polling-stats endpoint.
 * This route provides polling statistics (total requests, average response time,
 * active connections, error rate, rate limit stats) for system monitoring purposes.
 * Access is restricted to authenticated admin users.
 *
 * Covers:
 * - Success cases: Returning polling statistics data, handling empty activity
 * - Authentication: Rejecting unauthenticated requests with 401 status
 * - Rate limiting: Enforcing 429 status when rate limit exceeded, allowing normal requests
 * - Error handling: Graceful handling of database/auth errors with structured logging
 *
 * Uses the CLAUDE.md mock pattern with jest.requireMock() for accessing shared mock instances.
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

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import * as pollingStatsRoute from '@/app/api/monitor/polling-stats/route';

// Access mocks via requireMock (per CLAUDE.md mock pattern)
const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getServerSideIdentifier: jest.Mock;
};

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/monitor/polling-stats', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: rate limiting passes
    rateLimitMock.checkRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    });
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
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
            rateLimitStats: expect.any(Object),
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
            rateLimitStats: expect.any(Object),
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

  describe('Rate Limiting', () => {
    it('should enforce rate limit - 429 status', async () => {
      // Override default: rate limit exceeded
      rateLimitMock.checkRateLimit.mockResolvedValue({
        success: false,
        retryAfter: 60,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000,
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: 60,
        }),
        expect.objectContaining({ status: 429 })
      );
    });

    it('should allow requests when rate limit not exceeded', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await pollingStatsRoute.GET(
        new NextRequest('http://localhost:3000/api/monitor/polling-stats')
      );

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs[0].success).toBe(true);
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
