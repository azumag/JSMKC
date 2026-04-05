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
  createCSV: jest.fn(() => 'mock,csv,content\r\n'),
  csvRow: jest.fn((values) => values.join(',') + '\r\n'),
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
  csvRow: jest.Mock;
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
          qualificationPoints: 850,
          lives: 1,
          eliminated: false,
          times: { MC1: '0:58.123', DP1: '1:02.456' },
          courseScores: { MC1: 50, DP1: 45 },
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
          qualificationPoints: 720,
          lives: 2,
          eliminated: false,
          times: { MC1: '1:01.000', DP1: '1:05.789' },
          courseScores: { MC1: 40, DP1: 38 },
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'player2',
          },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      // No phase rounds: section 2 should be omitted
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);

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

      // Verify entry lookup: qualification stage only to exclude finals phase entries
      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'qualification' },
        include: { player: true },
        orderBy: { rank: 'asc' },
      });

      // Verify createCSV was called with correct headers and data including per-course columns
      const expectedCourseHeaders = [
        'MC1 Time', 'MC1 Points', 'DP1 Time', 'DP1 Points', 'GV1 Time', 'GV1 Points',
        'BC1 Time', 'BC1 Points', 'MC2 Time', 'MC2 Points', 'CI1 Time', 'CI1 Points',
        'GV2 Time', 'GV2 Points', 'DP2 Time', 'DP2 Points', 'BC2 Time', 'BC2 Points',
        'MC3 Time', 'MC3 Points', 'KB1 Time', 'KB1 Points', 'CI2 Time', 'CI2 Points',
        'VL1 Time', 'VL1 Points', 'BC3 Time', 'BC3 Points', 'MC4 Time', 'MC4 Points',
        'DP3 Time', 'DP3 Points', 'KB2 Time', 'KB2 Points', 'GV3 Time', 'GV3 Points',
        'VL2 Time', 'VL2 Points', 'RR Time', 'RR Points',
      ];
      expect(excelMock.createCSV).toHaveBeenCalledWith(
        ['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Qualification Points', 'Lives', 'Eliminated', ...expectedCourseHeaders],
        expect.arrayContaining([
          expect.arrayContaining([1, 'Player 1', 'player1', '83456', '1:23.456', '850', '1', 'No', '0:58.123', '50', '1:02.456', '45']),
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
        { success: false, error: 'Tournament not found', code: 'NOT_FOUND' },
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
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);
      excelMock.createCSV.mockReturnValue('mock,csv,empty');

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/export'
      );

      await taExportRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Empty entries should produce an empty data array but still include all headers
      expect(excelMock.createCSV).toHaveBeenCalledWith(
        expect.arrayContaining(['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Qualification Points', 'Lives', 'Eliminated', 'MC1 Time', 'MC1 Points', 'RR Time', 'RR Points']),
        []
      );

      // Verify constructor was called for CSV download
      expect(NextResponse._constructorCalls.length).toBe(1);
      const [body, init] = NextResponse._constructorCalls[0];
      expect(body).toContain('mock,csv,empty');
      expect(init.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    });

    it('should handle entries with null times and courseScores', async () => {
      const mockTournament = { id: 't1', name: 'Test Tournament', date: new Date('2024-01-01') };
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          rank: 1,
          totalTime: 83456,
          qualificationPoints: null,
          lives: 3,
          eliminated: false,
          times: null,
          courseScores: null,
          player: { id: 'p1', name: 'Player 1', nickname: 'player1' },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/ta/export');
      await taExportRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

      // All 20 course columns should be '-' when times/courseScores are null
      const callArgs = excelMock.createCSV.mock.calls[0];
      const rows = callArgs[1] as unknown[][];
      expect(rows).toHaveLength(1);
      // qualificationPoints null → '-'
      expect(rows[0][5]).toBe('-');
      // Per-course columns (starting at index 8): all 40 columns should be '-'
      for (let i = 8; i < rows[0].length; i++) {
        expect(rows[0][i]).toBe('-');
      }
      // 8 summary columns + 20 courses * 2 = 48 total columns
      expect(rows[0]).toHaveLength(48);
    });

    it('should correctly render eliminated entries and zero-value scores', async () => {
      const mockTournament = { id: 't1', name: 'Test Tournament', date: new Date('2024-01-01') };
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          rank: 1,
          totalTime: 83456,
          qualificationPoints: 0,
          lives: 0,
          eliminated: true,
          // courseScores[c] === 0 is a valid score (last place on a course)
          times: { MC1: '1:59.999' },
          courseScores: { MC1: 0 },
          player: { id: 'p1', name: 'Player 1', nickname: 'player1' },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/ta/export');
      await taExportRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

      const callArgs = excelMock.createCSV.mock.calls[0];
      const rows = callArgs[1] as unknown[][];
      expect(rows).toHaveLength(1);
      // eliminated: true → 'Yes'
      expect(rows[0][7]).toBe('Yes');
      // qualificationPoints === 0 → '0' (not '-')
      expect(rows[0][5]).toBe('0');
      // courseScores[MC1] === 0 → '0' (not '-')
      expect(rows[0][9]).toBe('0');
    });

    it('should append knockout phase rounds as a second section when present', async () => {
      const mockTournament = { id: 't1', name: 'Test Tournament', date: new Date('2024-01-01') };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);

      const mockPhaseRounds = [
        {
          id: 'round1',
          tournamentId: 't1',
          phase: 'phase1',
          roundNumber: 1,
          course: 'MC1',
          results: [
            { playerId: 'p1', timeMs: 61010, isRetry: false },
            { playerId: 'p2', timeMs: 65000, isRetry: true },
          ],
          eliminatedIds: ['p2'],
          livesReset: false,
        },
      ];
      const mockPhaseEntries = [
        { playerId: 'p1', player: { name: 'Player 1', nickname: 'p1nick' } },
        { playerId: 'p2', player: { name: 'Player 2', nickname: 'p2nick' } },
      ];

      // tTEntry.findMany is called twice: once for qualification, once for phase entries
      (prisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])          // qualification call
        .mockResolvedValueOnce(mockPhaseEntries); // phase player map call
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue(mockPhaseRounds);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/ta/export');
      await taExportRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

      // csvRow should have been called for section label, headers, and 2 player rows
      expect(excelMock.csvRow).toHaveBeenCalledWith(['=== KNOCKOUT PHASES ===']);
      expect(excelMock.csvRow).toHaveBeenCalledWith(
        ['Phase', 'Round', 'Course', 'Player Name', 'Nickname', 'Time (ms)', 'Time', 'Retry', 'Eliminated This Round', 'Lives Reset After Round']
      );
      // p1: not eliminated, no retry
      expect(excelMock.csvRow).toHaveBeenCalledWith(
        ['phase1', 1, 'MC1', 'Player 1', 'p1nick', 61010, '1:23.456', 'No', 'No', 'No']
      );
      // p2: eliminated this round, retry
      expect(excelMock.csvRow).toHaveBeenCalledWith(
        ['phase1', 1, 'MC1', 'Player 2', 'p2nick', 65000, '1:23.456', 'Yes', 'Yes', 'No']
      );
    });

    it('should omit phase section when no phase rounds exist', async () => {
      const mockTournament = { id: 't1', name: 'Test Tournament', date: new Date('2024-01-01') };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/ta/export');
      await taExportRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

      // csvRow should NOT have been called (no phase section)
      expect(excelMock.csvRow).not.toHaveBeenCalled();
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
        { success: false, error: 'Failed to export tournament', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    });
  });
});
