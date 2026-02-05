/**
 * @module GP Score Report API Route Tests - /api/tournaments/[id]/gp/match/[matchId]/report
 *
 * Test suite for the player-facing GP score reporting endpoint. This endpoint
 * allows authenticated players to self-report match scores via session-based auth.
 * Rate limiting and audit logging are used to prevent abuse.
 *
 * Key behaviors tested:
 * - POST: Reporting scores from player 1 or player 2, auto-confirmation when
 *   both players submit matching scores, mismatch detection for admin review,
 *   character usage logging for SMK characters, rate limiting (429),
 *   and graceful handling of secondary logging failures (scoreEntryLog, characterUsage).
 *
 * The dual-report system requires both players to independently submit their
 * race results. If scores match, the match is automatically confirmed.
 * If they differ, the match is flagged for admin review.
 */
// @ts-nocheck

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'Test UserAgent'),
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/constants', () => ({ SMK_CHARACTERS: ['mario', 'luigi', 'peach', 'toad', 'yoshi', 'bowser', 'donkey_kong', 'koopa'] }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/optimistic-locking', () => ({
  updateWithRetry: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'OptimisticLockError';
    }
  }
}));
jest.mock('@/lib/error-handling', () => ({
  createSuccessResponse: jest.fn((data, message) => ({ data, message, status: 200 })),
  createErrorResponse: jest.fn((message, status, code, details) => ({ data: { error: message, code, details }, status })),
  handleValidationError: jest.fn((message, field) => ({ data: { error: message, field }, status: 400 })),
  handleAuthError: jest.fn((message) => ({ data: { error: message }, status: 401 })),
  handleDatabaseError: jest.fn((error, operation) => ({ data: { error: `Database error: ${operation}` }, status: 500 })),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { updateWithRetry, OptimisticLockError } from '@/lib/optimistic-locking';
import { POST } from '@/app/api/tournaments/[id]/gp/match/[matchId]/report/route';

const {
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError
} = jest.requireMock('@/lib/error-handling');

// Mock NextRequest class — matches the pattern used by BM/MR test suites
class MockNextRequest {
  constructor(
    private url: string,
    private body?: any,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('GP Score Report API Route - /api/tournaments/[id]/gp/match/[matchId]/report', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    // Re-establish request-utils mock implementations after reset
    const requestUtilsMocks = jest.requireMock('@/lib/request-utils');
    requestUtilsMocks.getClientIdentifier.mockReturnValue('127.0.0.1');
    requestUtilsMocks.getUserAgent.mockReturnValue('Test UserAgent');
    // Re-establish sanitizeInput: resetAllMocks clears the passthrough implementation
    const sanitizeMock = jest.requireMock('@/lib/sanitize');
    sanitizeMock.sanitizeInput.mockImplementation((data: unknown) => data);
    // Re-establish error-handling mock implementations after resetAllMocks
    const errorHandling = jest.requireMock('@/lib/error-handling');
    errorHandling.createSuccessResponse.mockImplementation((data: unknown, message: string) => ({ data, message, status: 200 }));
    errorHandling.createErrorResponse.mockImplementation((message: string, status: number, code: string, details: unknown) => ({ data: { error: message, code, details }, status }));
    errorHandling.handleValidationError.mockImplementation((message: string, field: string) => ({ data: { error: message, field }, status: 400 }));
    errorHandling.handleAuthError.mockImplementation((message: string) => ({ data: { error: message }, status: 401 }));
    errorHandling.handleDatabaseError.mockImplementation((error: unknown, operation: string) => ({ data: { error: `Database error: ${operation}` }, status: 500 }));
    // Default: admin session so auth passes. Tests that check auth failure override this.
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
    // Reset Prisma mocks to prevent cross-test contamination
    (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
    (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({});
    (prisma.gPMatch.update as jest.Mock).mockResolvedValue({});
    (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    // Reset updateWithRetry mock - it should execute the callback
    (updateWithRetry as jest.Mock).mockImplementation(async (_prisma, callback) => {
      return callback({
        gPMatch: prisma.gPMatch,
      });
    });
  });

  describe('POST - Report score for grand prix match', () => {
    // Success case - Reports score from player 1
    it('should report score from player 1 and wait for player 2', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 36,
        player1ReportedPoints2: 24,
        player1ReportedRaces: [],
        version: 1,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: updatedMatch, waitingFor: 'player2' },
        message: 'Score reported successfully',
        status: 200
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({ match: updatedMatch, waitingFor: 'player2' }, 'Score reported successfully');
    });

    // Success case - Reports score from player 2
    it('should report score from player 2 and wait for player 1', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player2ReportedPoints1: 24,
        player2ReportedPoints2: 36,
        player2ReportedRaces: [],
        version: 1,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 2,
        races: [
          { course: 'Mario Circuit 1', position1: 2, position2: 1 },
          { course: 'Donut Plains 1', position1: 2, position2: 1 },
          { course: 'Ghost Valley 1', position1: 2, position2: 1 },
          { course: 'Bowser Castle 1', position1: 2, position2: 1 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: updatedMatch, waitingFor: 'player1' },
        message: 'Score reported successfully',
        status: 200
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({ match: updatedMatch, waitingFor: 'player1' }, 'Score reported successfully');
    });

    // Success case - Auto-confirms when both reports match
    it('should auto-confirm match when both players report matching scores', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1ReportedRaces: [],
        player2ReportedRaces: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player2ReportedPoints1: 18,
        player2ReportedPoints2: 6,
        player2ReportedRaces: [],
        version: 1,
      };

      const confirmedMatch = {
        ...updatedMatch,
        points1: 18,
        points2: 6,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
        version: 2,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 1 }) // First updateWithRetry callback: version check for report
        .mockResolvedValueOnce({ version: 1 }); // Second updateWithRetry callback: version check for completion
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock)
        .mockResolvedValueOnce(updatedMatch)  // First call: score report
        .mockResolvedValueOnce(confirmedMatch); // Second call: completion
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 2,
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: confirmedMatch, autoConfirmed: true },
        message: 'Scores confirmed and match completed',
        status: 200
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({ match: confirmedMatch, autoConfirmed: true }, 'Scores confirmed and match completed');
      expect(prisma.gPQualification.updateMany).toHaveBeenCalledTimes(2);
    });

    // Success case - Reports mismatch detected
    // Uses mockResolvedValueOnce for each findUnique call to ensure correct mock resolution
    it('should detect and report score mismatch between players', async () => {
      /* Initial match state: first findUnique returns match with completed=false */
      const initialMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player2ReportedPoints1: 12,
        player2ReportedPoints2: 12,
        player1ReportedRaces: [],
        player2ReportedRaces: [],
        version: 1,
      };

      /* Updated match returned from update call */
      const updatedMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player2ReportedPoints1: 12,
        player2ReportedPoints2: 12,
        player1ReportedRaces: [],
        player2ReportedRaces: [],
        version: 1,
      };

      const races = [
        { course: 'Mario Circuit 1', position1: 2, position2: 1 },
        { course: 'Donut Plains 1', position1: 2, position2: 2 },
        { course: 'Ghost Valley 1', position1: 2, position2: 1 },
        { course: 'Bowser Castle 1', position1: 2, position2: 2 },
      ];

      /* Explicitly mock each findUnique call in sequence */
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(initialMatch)   // First call: match existence check
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: {
          match: updatedMatch,
          mismatch: true,
          player1Report: { points1: 18, points2: 6 },
          player2Report: { points1: 12, points2: 12 },
        },
        message: 'Score reported but mismatch detected - awaiting admin review',
        status: 200
      });
      expect(createSuccessResponse).toHaveBeenCalledWith({
        match: updatedMatch,
        mismatch: true,
        player1Report: { points1: 18, points2: 6 },
        player2Report: { points1: 12, points2: 12 },
      }, 'Score reported but mismatch detected - awaiting admin review');
    });

    // Success case - Logs character usage when provided
    it('should log character usage when character is provided', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 36,
        player1ReportedPoints2: 24,
        player1ReportedRaces: [],
        version: 1,
      };

      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2 },
        { course: 'Donut Plains 1', position1: 1, position2: 2 },
        { course: 'Ghost Valley 1', position1: 1, position2: 2 },
        { course: 'Bowser Castle 1', position1: 1, position2: 2 },
      ];

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        character: 'mario',
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.matchCharacterUsage.create).toHaveBeenCalledWith({
        data: {
          matchId: 'm1',
          matchType: 'GP',
          playerId: 'p1',
          character: 'mario',
        },
      });
    });

    // Not found case - Returns 404 when match is not found
    it('should return 404 when match is not found', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/nonexistent/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Match not found', field: 'matchId' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Match not found', 'matchId');
    });

    // Validation error case - Returns 400 when character is invalid
    it('should return 400 when character is invalid', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        character: 'invalid_character',
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Invalid character', field: 'character' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Invalid character', 'character');
    });

    // Validation error case - Returns 400 when match is already completed
    // Completed check runs before auth/logging to avoid unnecessary DB calls
    it('should return 400 when match is already completed', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: true,
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Match already completed', field: 'matchStatus' },
        status: 400
      });
      expect(handleValidationError).toHaveBeenCalledWith('Match already completed', 'matchStatus');
      // No score entry log should be created since completed check is early
      expect(prisma.scoreEntryLog.create).not.toHaveBeenCalled();
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Database error: score report' },
        status: 500
      });
      expect(handleDatabaseError).toHaveBeenCalledWith(expect.any(Error), 'score report');
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to report score', { error: expect.any(Error), tournamentId: 't1', matchId: 'm1' });
    });

    // Edge case - Continues when score entry log creation fails
    it('should continue when score entry log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 36,
        player1ReportedPoints2: 24,
        player1ReportedRaces: [],
        version: 1,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockRejectedValue(new Error('Log failed'));
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create score entry log', expect.any(Object));
    });

    // Edge case - Continues when character usage log creation fails
    it('should continue when character usage log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 36,
        player1ReportedPoints2: 24,
        player1ReportedRaces: [],
        version: 1,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.matchCharacterUsage.create as jest.Mock).mockRejectedValue(new Error('Char log failed'));
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        character: 'mario',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create character usage log', expect.any(Object));
    });

    // Edge case - Calculates correct driver points
    // Report route uses DRIVER_POINTS = [0, 9, 6, 3, 1] (1st=9, 2nd=6, 3rd=3, 4th=1)
    it('should calculate correct driver points for positions', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };

      /*
       * Expected points calculation with DRIVER_POINTS [0, 9, 6, 3, 1]:
       * Race 1: P1=1st(9), P2=2nd(6)
       * Race 2: P1=1st(9), P2=3rd(3)
       * Race 3: P1=2nd(6), P2=1st(9)
       * Race 4: P1=2nd(6), P2=4th(1)
       * Totals: P1=9+9+6+6=30, P2=6+3+9+1=19
       */
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 30,
        player1ReportedPoints2: 19,
        player1ReportedRaces: [],
        version: 1,
      };

      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2 },
        { course: 'Donut Plains 1', position1: 1, position2: 3 },
        { course: 'Ghost Valley 1', position1: 2, position2: 1 },
        { course: 'Bowser Castle 1', position1: 2, position2: 4 },
      ];

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.scoreEntryLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportedData: expect.objectContaining({
            totalPoints1: 30,
            totalPoints2: 19,
          }),
        }),
      });
    });

    // Authorization - Returns 401 when no valid session is present
    it('should return 401 when unauthorized', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      // No session — user is not authenticated
      (auth as jest.Mock).mockResolvedValueOnce(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: {
          error: 'Unauthorized: Not authorized for this match',
        },
        status: 401
      });
      expect(handleAuthError).toHaveBeenCalledWith('Unauthorized: Not authorized for this match');
    });
  });
});
