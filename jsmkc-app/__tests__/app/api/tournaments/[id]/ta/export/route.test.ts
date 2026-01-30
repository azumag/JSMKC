/**
 * @module Test Suite: GET /api/tournaments/[id]/ta/export
 *
 * Tests for the Time Attack (TA) CSV export API route handler.
 * This endpoint generates a CSV file containing TA standings for a tournament,
 * including rank, player name, nickname, total time (in ms and formatted),
 * lives remaining, and elimination status.
 *
 * Test categories:
 * - Success Cases: Verifies CSV generation with valid entries, tournament not found
 *   handling (404), and empty entries edge case.
 * - Error Handling: Validates graceful handling of database errors with proper
 *   logging and 500 status response.
 *
 * Dependencies mocked:
 * - @/lib/excel: CSV creation utility (createCSV) and time formatting (formatTime)
 * - @/lib/logger: Structured Winston logging for error tracking
 * - next/server: NextResponse.json and NextResponse constructor for response assertions
 * - @/lib/prisma: Database client for tournament and TTEntry queries
 *
 * IMPORTANT: jest.mock() calls use the global jest (not imported from @jest/globals)
 * because babel-jest's hoisting plugin does not properly hoist jest.mock()
 * when jest is imported from @jest/globals, causing mocks to not be applied.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// Mock excel utilities
jest.mock('@/lib/excel', () => ({
  createCSV: jest.fn(() => 'mock,csv,content'),
  formatTime: jest.fn(() => '1:23.456'),
}));

// Mock logger with shared singleton
jest.mock('@/lib/logger', () => {
  const sharedLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => sharedLogger),
  };
});

// Mock next/server with both NextResponse.json and NextResponse constructor
jest.mock('next/server', () => {
  const mockJson = jest.fn();
  // Track constructor calls for CSV export verification
  const constructorCalls = [];
  class MockNextResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.init = init;
      constructorCalls.push([body, init]);
    }
  }
  MockNextResponse.json = mockJson;
  // Expose constructor call tracking
  MockNextResponse._constructorCalls = constructorCalls;

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
    NextResponse: MockNextResponse,
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import * as taExportRoute from '@/app/api/tournaments/[id]/ta/export/route';

// Access mocks via requireMock for reliable references
const excelMock = jest.requireMock('@/lib/excel') as {
  createCSV: jest.Mock;
  formatTime: jest.Mock;
};

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/tournaments/[id]/ta/export', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear constructor call tracking
    NextResponse._constructorCalls.length = 0;
    // Restore default return values for excel mocks
    excelMock.createCSV.mockReturnValue('mock,csv,content');
    excelMock.formatTime.mockReturnValue('1:23.456');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should export TA entries as CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-01'),
      };

      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          rank: 1,
          totalTime: 83456,
          lives: 1,
          eliminated: false,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'player1',
          },
        },
        {
          id: 'entry2',
          tournamentId: 't1',
          rank: 2,
          totalTime: 91234,
          lives: 2,
          eliminated: false,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'player2',
          },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Verify tournament lookup
      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        select: { name: true, date: true },
      });

      // Verify entry lookup
      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: { rank: 'asc' },
      });

      // Verify createCSV was called with correct headers and data
      expect(excelMock.createCSV).toHaveBeenCalledWith(
        ['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Lives', 'Eliminated'],
        expect.arrayContaining([
          expect.arrayContaining([1, 'Player 1', 'player1', '83456', '1:23.456', '1', 'No']),
        ])
      );

      // Verify NextResponse constructor was called (not .json) for CSV download
      expect(NextResponse._constructorCalls.length).toBe(1);
      const [body, init] = NextResponse._constructorCalls[0];
      // Body should contain BOM + CSV content
      expect(body).toContain('mock,csv,content');
      expect(init.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(init.headers['Content-Disposition']).toContain('Test Tournament 2024_TA_');

      // NextResponse.json should NOT have been called for success
      expect(NextResponse.json).not.toHaveBeenCalled();
    });

    it('should handle tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    });

    it('should handle empty entries', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Empty Tournament',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      excelMock.createCSV.mockReturnValue('mock,csv,empty');

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Empty entries should produce an empty data array
      expect(excelMock.createCSV).toHaveBeenCalledWith(
        ['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Lives', 'Eliminated'],
        []
      );

      // Verify constructor was called for CSV download
      expect(NextResponse._constructorCalls.length).toBe(1);
      const [body, init] = NextResponse._constructorCalls[0];
      expect(body).toContain('mock,csv,empty');
      expect(init.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database error');
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(mockError);

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Verify logger error was called via the shared singleton
      const sharedLogger = loggerMock.createLogger();
      expect(sharedLogger.error).toHaveBeenCalledWith(
        'Failed to export tournament',
        { error: mockError, tournamentId: 't1' }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to export tournament' },
        { status: 500 }
      );
    });
  });
});
