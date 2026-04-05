/**
 * @module Test Suite: GET /api/tournaments/[id]/ta/export/phases
 *
 * Tests for the TA knockout phases CSV export endpoint.
 * Returns one CSV row per player per phase round, covering phase1/2/3.
 * Returns 404 when no phase rounds exist.
 */
// @ts-nocheck

jest.mock('@/lib/excel', () => ({
  createCSV: jest.fn(() => 'mock,csv,phases'),
  formatTime: jest.fn(() => '1:01.01'),
}));

jest.mock('@/lib/logger', () => {
  const sharedLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { createLogger: jest.fn(() => sharedLogger) };
});

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  const constructorCalls = [];
  class MockNextResponse {
    constructor(body, init = {}) { this.body = body; this.init = init; constructorCalls.push([body, init]); }
  }
  MockNextResponse.json = mockJson;
  MockNextResponse._constructorCalls = constructorCalls;
  class MockNextRequest {
    constructor(url, init = {}) { this.url = url; this.method = init.method || 'GET'; }
  }
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse, __esModule: true };
});

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import * as phasesRoute from '@/app/api/tournaments/[id]/ta/export/phases/route';

const excelMock = jest.requireMock('@/lib/excel') as { createCSV: jest.Mock; formatTime: jest.Mock };

describe('GET /api/tournaments/[id]/ta/export/phases', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    NextResponse._constructorCalls.length = 0;
    excelMock.createCSV.mockReturnValue('mock,csv,phases');
    excelMock.formatTime.mockReturnValue('1:01.01');
  });

  afterEach(() => jest.restoreAllMocks());

  it('should export phase rounds as CSV', async () => {
    const mockTournament = { id: 't1', name: 'Test Tournament', date: new Date('2024-01-01') };
    const mockRounds = [
      {
        id: 'r1', tournamentId: 't1', phase: 'phase1', roundNumber: 1, course: 'MC1',
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

    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue(mockRounds);
    (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockPhaseEntries);

    const request = new NextRequest('http://localhost/api/tournaments/t1/ta/export/phases');
    await phasesRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

    expect(excelMock.createCSV).toHaveBeenCalledWith(
      ['Phase', 'Round', 'Course', 'Player Name', 'Nickname', 'Time (ms)', 'Time', 'Retry', 'Eliminated This Round', 'Lives Reset After Round'],
      expect.arrayContaining([
        // p1: not eliminated, no retry
        ['phase1', 1, 'MC1', 'Player 1', 'p1nick', 61010, '1:01.01', 'No', 'No', 'No'],
        // p2: eliminated, retry
        ['phase1', 1, 'MC1', 'Player 2', 'p2nick', 65000, '1:01.01', 'Yes', 'Yes', 'No'],
      ])
    );

    expect(NextResponse._constructorCalls.length).toBe(1);
    const [body, init] = NextResponse._constructorCalls[0];
    expect(body).toContain('mock,csv,phases');
    expect(init.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(init.headers['Content-Disposition']).toContain('Test Tournament_TA_Knockout_');
  });

  it('should return 404 when no phase rounds exist', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1', name: 'T', date: null });
    (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/tournaments/t1/ta/export/phases');
    await phasesRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: 'No knockout phase data found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  });

  it('should return 404 when tournament not found', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/tournaments/t1/ta/export/phases');
    await phasesRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

    expect(NextResponse.json).toHaveBeenCalledWith(
      { success: false, error: 'Tournament not found', code: 'NOT_FOUND' },
      { status: 404 }
    );
  });

  it('should handle livesReset=true correctly', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1', name: 'T', date: null });
    (prisma.tTPhaseRound.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1', tournamentId: 't1', phase: 'phase3', roundNumber: 5, course: 'GV1',
        results: [{ playerId: 'p1', timeMs: 80000, isRetry: false }],
        eliminatedIds: [],
        livesReset: true,  // lives reset to 3 after this round
      },
    ]);
    (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([
      { playerId: 'p1', player: { name: 'Player 1', nickname: 'p1' } },
    ]);

    const request = new NextRequest('http://localhost/api/tournaments/t1/ta/export/phases');
    await phasesRoute.GET(request, { params: Promise.resolve({ id: 't1' }) });

    const callArgs = excelMock.createCSV.mock.calls[0];
    const rows = callArgs[1] as unknown[][];
    // Lives Reset After Round should be 'Yes'
    expect(rows[0][9]).toBe('Yes');
    // Not eliminated
    expect(rows[0][8]).toBe('No');
  });
});
