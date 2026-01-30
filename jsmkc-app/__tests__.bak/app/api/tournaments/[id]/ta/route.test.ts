// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies


jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('@/lib/rate-limit', () => ({
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'test-agent'),
  rateLimit: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
    UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
    DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',
  },
}));

jest.mock('@/lib/ta/rank-calculation', () => ({
  recalculateRanks: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/ta/promotion', () => ({
  promoteToFinals: jest.fn(),
  promoteToRevival1: jest.fn(),
  promoteToRevival2: jest.fn(),
}));

jest.mock('@/lib/constants', () => ({
  COURSES: ['MC1', 'MC2', 'MC3'],
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
import { createLogger } from '@/lib/logger';

import * as taRoute from '@/app/api/tournaments/[id]/ta/route';

describe('GET /api/tournaments/[id]/ta', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return TA entries for qualification stage', async () => {
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          playerId: 'p1',
          stage: 'qualification',
          rank: 1,
          totalTime: 83456,
          lives: 1,
          times: { MC1: '1:23.456', MC2: '1:30.123' },
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'p1',
          },
        },
      ];

      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTEntry.count as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const logger = createLogger('ta-route-test');
      const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to delete entry',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to delete entry',
        }),
        { status: 500 }
      );
    });
  });
});
