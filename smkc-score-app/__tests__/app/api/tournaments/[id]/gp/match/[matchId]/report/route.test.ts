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
jest.mock('@/lib/constants', () => ({
  COURSE_INFO: [
    { abbr: 'MC1', cup: 'Mushroom' },
    { abbr: 'DP1', cup: 'Mushroom' },
    { abbr: 'GV1', cup: 'Mushroom' },
    { abbr: 'BC1', cup: 'Mushroom' },
    { abbr: 'MC2', cup: 'Mushroom' },
    { abbr: 'CI1', cup: 'Flower' },
  ],
  SMK_CHARACTERS: ['mario', 'luigi', 'peach', 'toad', 'yoshi', 'bowser', 'donkey_kong', 'koopa'],
  DRIVER_POINTS: [0, 9, 6, 3, 1, 0, 0, 0, 0],
  TOTAL_GP_RACES: 5,
  getDriverPoints: (pos: number) => [0, 9, 6, 3, 1, 0, 0, 0, 0][pos] ?? 0,
}));
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
  handleRateLimitError: jest.fn((retryAfter) => ({ data: { error: 'Rate limit exceeded' }, status: 429, retryAfter })),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { updateWithRetry } from '@/lib/optimistic-locking';
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
    errorHandling.handleRateLimitError.mockImplementation((retryAfter: number) => ({ data: { error: 'Rate limit exceeded' }, status: 429, retryAfter }));
    // Re-establish rate-limit mock after resetAllMocks (global mock from jest.setup.js gets cleared)
    const rateLimitMocks = jest.requireMock('@/lib/rate-limit');
    rateLimitMocks.checkRateLimit.mockResolvedValue({ success: true, remaining: 100 });
    // Default: admin session so auth passes. Tests that check auth failure override this.
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin', userType: 'admin' } });
    // Reset Prisma mocks to prevent cross-test contamination
    (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ dualReportEnabled: true });
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
        player1ReportedPoints1: 45,
        player1ReportedPoints2: 30,
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
          { course: 'MC1', position1: 1, position2: 2 },
          { course: 'DP1', position1: 1, position2: 2 },
          { course: 'GV1', position1: 1, position2: 2 },
          { course: 'BC1', position1: 1, position2: 2 },
          { course: 'MC2', position1: 1, position2: 2 },
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
        player2ReportedPoints1: 30,
        player2ReportedPoints2: 45,
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
          { course: 'MC1', position1: 2, position2: 1 },
          { course: 'DP1', position1: 2, position2: 1 },
          { course: 'GV1', position1: 2, position2: 1 },
          { course: 'BC1', position1: 2, position2: 1 },
          { course: 'MC2', position1: 2, position2: 1 },
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
        player1ReportedPoints1: 45,
        player1ReportedPoints2: 30,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1ReportedRaces: [],
        player2ReportedRaces: null,
      };

      const updatedMatch = {
        ...mockMatch,
        player2ReportedPoints1: 45,
        player2ReportedPoints2: 30,
        player2ReportedRaces: [],
        version: 1,
      };

      const confirmedMatch = {
        ...updatedMatch,
        points1: 45,
        points2: 30,
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
          { course: 'MC1', position1: 1, position2: 2 },
          { course: 'DP1', position1: 1, position2: 2 },
          { course: 'GV1', position1: 1, position2: 2 },
          { course: 'BC1', position1: 1, position2: 2 },
          { course: 'MC2', position1: 1, position2: 2 },
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
        { course: 'MC1', position1: 2, position2: 1 },
        { course: 'DP1', position1: 3, position2: 2 },
        { course: 'GV1', position1: 2, position2: 1 },
        { course: 'BC1', position1: 3, position2: 1 },
        { course: 'MC2', position1: 1, position2: 2 },
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

    // Error case - Race data mismatch when scores match but races differ
    it('should return 409 RACE_DATA_MISMATCH when scores match but race data differs', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { userId: null },
        player2: { userId: null },
        completed: false,
        player1ReportedPoints1: 45,
        player1ReportedPoints2: 30,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1ReportedRaces: [
          { course: 'MC1', position1: 1, position2: 2 },
          { course: 'DP1', position1: 1, position2: 2 },
          { course: 'GV1', position1: 1, position2: 2 },
          { course: 'BC1', position1: 1, position2: 2 },
          { course: 'MC2', position1: 1, position2: 2 },
        ],
        player2ReportedRaces: null,
      };

      const player2Races = [
        { course: 'MC1', position1: 2, position2: 1 },
        { course: 'DP1', position1: 2, position2: 1 },
        { course: 'GV1', position1: 2, position2: 1 },
        { course: 'BC1', position1: 2, position2: 1 },
        { course: 'MC2', position1: 2, position2: 1 },
      ];

      const updatedMatch = {
        ...mockMatch,
        player2ReportedPoints1: 45,
        player2ReportedPoints2: 30,
        player2ReportedRaces: player2Races,
        version: 1,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 }); // updateWithRetry callback: version check
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 2,
        races: player2Races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(409);
      expect(result.data.error).toBe('Race data mismatch: both players reported the same score but different race details. Please refresh and reconfirm.');
      expect(result.data.code).toBe('RACE_DATA_MISMATCH');
      expect(result.data.details).toEqual({
        player1Races: mockMatch.player1ReportedRaces,
        player2Races: player2Races,
        requiresRefresh: true,
      });
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
        player1ReportedPoints1: 45,
        player1ReportedPoints2: 30,
        player1ReportedRaces: [],
        version: 1,
      };

      const races = [
        { course: 'MC1', position1: 1, position2: 2 },
        { course: 'DP1', position1: 1, position2: 2 },
        { course: 'GV1', position1: 1, position2: 2 },
        { course: 'BC1', position1: 1, position2: 2 },
        { course: 'MC2', position1: 1, position2: 2 },
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

    /*
     * Spec confirmed 2026-04-21: completed matches are NOT rejected. They
     * enter the "score correction" path — the original admin confirmation
     * stays intact but the participant can re-submit a corrected score,
     * which overwrites points1/points2 and re-runs qualification recalc.
     * BM and MR report routes implement the same correction path, so the
     * behavior is cross-mode by design (not a GP-only quirk).
     *
     * The older spec (400 + "Match already completed") was removed when
     * the correction path was introduced; this test now pins the current
     * contract so future refactors can't silently drop it.
     */
    it('should enter correction path and save updated score when match is already completed', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        cup: 'Mushroom',
        player1: { userId: null },
        player2: { userId: null },
        completed: true,
      };

      const correctedMatch = {
        ...mockMatch,
        points1: 45,
        points2: 30,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
        version: 2,
      };

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 1 }); // updateWithRetry callback: version check
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(correctedMatch);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [
          { course: 'MC1', position1: 1, position2: 2 },
          { course: 'DP1', position1: 1, position2: 2 },
          { course: 'GV1', position1: 1, position2: 2 },
          { course: 'BC1', position1: 1, position2: 2 },
          { course: 'MC2', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { match: correctedMatch, corrected: true },
        message: 'Score correction saved',
        status: 200,
      });
      expect(createSuccessResponse).toHaveBeenCalledWith(
        { match: correctedMatch, corrected: true },
        'Score correction saved'
      );
      expect(handleValidationError).not.toHaveBeenCalled();
      /* Both players' qualification stats must be recalculated after a
       * correction — the route calls recalculatePlayerStats twice, each
       * call fires an updateMany under the hood. */
      expect(prisma.gPQualification.updateMany).toHaveBeenCalledTimes(2);
    });

    it('should reject completed-match corrections that change the assigned cup', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        cup: 'Mushroom',
        player1: { userId: null },
        player2: { userId: null },
        completed: true,
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValueOnce(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [
          { course: 'CI1', position1: 1, position2: 2 },
          { course: 'CI1', position1: 1, position2: 2 },
          { course: 'CI1', position1: 1, position2: 2 },
          { course: 'CI1', position1: 1, position2: 2 },
          { course: 'CI1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });

      expect(result).toEqual({
        data: { error: 'Submitted races do not match the assigned cup for this match', field: 'races' },
        status: 400,
      });
      expect(handleValidationError).toHaveBeenCalledWith(
        'Submitted races do not match the assigned cup for this match',
        'races'
      );
      expect(prisma.gPMatch.update).not.toHaveBeenCalled();
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
        player1ReportedPoints1: 45,
        player1ReportedPoints2: 30,
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
          { course: 'MC1', position1: 1, position2: 2 },
          { course: 'DP1', position1: 1, position2: 2 },
          { course: 'GV1', position1: 1, position2: 2 },
          { course: 'BC1', position1: 1, position2: 2 },
          { course: 'MC2', position1: 1, position2: 2 },
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
        player1ReportedPoints1: 45,
        player1ReportedPoints2: 30,
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
          { course: 'MC1', position1: 1, position2: 2 },
          { course: 'DP1', position1: 1, position2: 2 },
          { course: 'GV1', position1: 1, position2: 2 },
          { course: 'BC1', position1: 1, position2: 2 },
          { course: 'MC2', position1: 1, position2: 2 },
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
       * Race 5: P1=1st(9), P2=2nd(6)
       * Totals: P1=9+9+6+6+9=39, P2=6+3+9+1+6=25
       */
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 39,
        player1ReportedPoints2: 25,
        player1ReportedRaces: [],
        version: 1,
      };

      const races = [
        { course: 'MC1', position1: 1, position2: 2 },
        { course: 'DP1', position1: 1, position2: 3 },
        { course: 'GV1', position1: 2, position2: 1 },
        { course: 'BC1', position1: 2, position2: 4 },
        { course: 'MC2', position1: 1, position2: 2 },
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
            totalPoints1: 39,
            totalPoints2: 25,
          }),
        }),
      });
    });

    it('should treat 5th through 8th place as zero-point finishes', async () => {
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
        player1ReportedPoints1: 15,
        player1ReportedPoints2: 16,
        player1ReportedRaces: [],
        version: 1,
      };

      const races = [
        { course: 'MC1', position1: 8, position2: 4 },
        { course: 'DP1', position1: 5, position2: 2 },
        { course: 'GV1', position1: 1, position2: 7 },
        { course: 'BC1', position1: 6, position2: 1 },
        { course: 'MC2', position1: 2, position2: 8 },
      ];

      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce({ version: 0 });
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
            totalPoints1: 15,
            totalPoints2: 16,
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
