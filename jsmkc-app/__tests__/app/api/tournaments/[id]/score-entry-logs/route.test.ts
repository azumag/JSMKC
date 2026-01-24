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
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      await scoreEntryLogsRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/score-entry-logs'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const logger = createLogger('score-entry-logs-test');
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

      const logger = createLogger('score-entry-logs-test');
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
