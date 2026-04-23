/**
 * @module __tests__/lib/api-factories/match-detail-route.test.ts
 *
 * Test suite for match detail route factory from `@/lib/api-factories/match-detail-route`.
 *
 * This suite validates the factory function that generates GET/PUT handlers for
 * individual match API routes. Tests cover:
 *
 * - GET handler: Fetching match with player details
 *   - Success response using createSuccessResponse
 *   - 404 handling when match not found (createErrorResponse with 404)
 *   - 500 error handling for database errors (handleDatabaseError)
 * - PUT handler: Updating match score with optimistic locking
 *   - Authentication requirement (putRequiresAuth)
 *   - Input sanitization (sanitizeBody)
 *   - Version validation
 *   - Score field validation
 *   - Custom score validation (validateScores)
 *   - OptimisticLockError handling with currentVersion in response
 *   - Database error handling
 *
 * All responses use structured error-handling helpers (createSuccessResponse,
 * createErrorResponse, handleValidationError, handleDatabaseError).
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { NextRequest } from 'next/server';
import { OptimisticLockError } from '@/lib/optimistic-locking';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/sanitize');
jest.mock('@/lib/error-handling');
jest.mock('@/lib/logger');
jest.mock('@/lib/tournament-identifier', () => ({
  resolveTournamentId: jest.fn(async (identifier: string) => identifier),
}));
/* Mock qualification-confirmed-check: the factory now checks if qualification is
 * locked before allowing score edits. Return null (= not locked) by default. */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));
/* Mock rate-limit: required by the factory's PUT handler */
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 100 }),
}));
/* Mock request-utils: required by the factory's rate-limit integration */
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn().mockReturnValue('127.0.0.1'),
}));
/* Mock score-report-helpers: recalcStatsConfig invokes recalculatePlayerStats
 * after a successful qualification-stage PUT. Tests assert the mock's call
 * history to verify the hook is wired correctly. */
jest.mock('@/lib/api-factories/score-report-helpers', () => ({
  recalculatePlayerStats: jest.fn().mockResolvedValue(undefined),
}));

import { auth } from '@/lib/auth';
import { sanitizeInput } from '@/lib/sanitize';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { recalculatePlayerStats } from '@/lib/api-factories/score-report-helpers';
import { createSuccessResponse, createErrorResponse, handleValidationError, handleDatabaseError } from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Match Detail Route Factory', () => {
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockSanitizeInput: jest.MockedFunction<typeof sanitizeInput>;
  let mockResolveTournamentId: jest.MockedFunction<typeof resolveTournamentId>;
  let mockCreateSuccessResponse: jest.MockedFunction<typeof createSuccessResponse>;
  let mockCreateErrorResponse: jest.MockedFunction<typeof createErrorResponse>;
  let mockHandleValidationError: jest.MockedFunction<typeof handleValidationError>;
  let mockHandleDatabaseError: jest.MockedFunction<typeof handleDatabaseError>;
  let mockLogger: ReturnType<typeof createLogger>;

  const createMockMatch = (overrides = {}) => ({
    id: 'match-123',
    score1: 0,
    score2: 0,
    completed: false,
    version: 1,
    player1: { id: 'player-1', name: 'Player 1' },
    player2: { id: 'player-2', name: 'Player 2' },
    ...overrides,
  });

  /** Minimal config shared across tests — override per-test as needed */
  const baseConfig = {
    matchModel: 'bMMatch',
    loggerName: 'bm-match',
    scoreFields: { field1: 'score1', field2: 'score2' },
    detailField: 'rounds',
    updateMatchScore: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockAuth = auth as jest.MockedFunction<typeof auth>;
    mockSanitizeInput = sanitizeInput as jest.MockedFunction<typeof sanitizeInput>;
    mockResolveTournamentId = resolveTournamentId as jest.MockedFunction<typeof resolveTournamentId>;
    mockCreateSuccessResponse = createSuccessResponse as jest.MockedFunction<typeof createSuccessResponse>;
    mockCreateErrorResponse = createErrorResponse as jest.MockedFunction<typeof createErrorResponse>;
    mockHandleValidationError = handleValidationError as jest.MockedFunction<typeof handleValidationError>;
    mockHandleDatabaseError = handleDatabaseError as jest.MockedFunction<typeof handleDatabaseError>;
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    (createLogger as jest.Mock).mockReturnValue(mockLogger);
    mockSanitizeInput.mockImplementation((input) => input);
    mockResolveTournamentId.mockImplementation(async (identifier) => identifier);

    // Default success responses
    mockCreateSuccessResponse.mockReturnValue({
      status: 200,
      json: jest.fn(),
    } as any);
    mockCreateErrorResponse.mockReturnValue({
      status: 500,
      json: jest.fn(),
    } as any);
    mockHandleValidationError.mockReturnValue({
      status: 400,
      json: jest.fn(),
    } as any);
    mockHandleDatabaseError.mockReturnValue({
      status: 500,
      json: jest.fn(),
    } as any);
  });

  // ============================================================
  // GET Handler Tests
  // ============================================================

  describe('GET Handler', () => {
    it('should return match data via createSuccessResponse', async () => {
      const mockMatch = createMockMatch();
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const { GET } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000');
      await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateSuccessResponse).toHaveBeenCalledWith(mockMatch);
      expect((prisma.bMMatch as any).findUnique).toHaveBeenCalledWith({
        where: { id: 'match-123' },
        include: { player1: true, player2: true },
      });
      expect(mockResolveTournamentId).toHaveBeenCalledWith('tournament-1');
    });

    it('should allow unauthenticated GET by default', async () => {
      const mockMatch = createMockMatch();
      mockAuth.mockResolvedValue(null);
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const { GET } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000');
      await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockAuth).not.toHaveBeenCalled();
      expect(mockCreateSuccessResponse).toHaveBeenCalledWith(mockMatch);
    });

    it('should return 401 when getRequiresAuth and user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const { GET } = createMatchDetailHandlers({
        ...baseConfig,
        getRequiresAuth: true,
      });

      const request = new NextRequest('http://localhost:3000');
      await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockAuth).toHaveBeenCalled();
      expect(mockCreateErrorResponse).toHaveBeenCalledWith('Unauthorized', 401, 'UNAUTHORIZED');
      expect((prisma.bMMatch as any).findUnique).not.toHaveBeenCalled();
    });

    it('should resolve slug identifiers before fetching the match', async () => {
      const mockMatch = createMockMatch({ tournamentId: 'resolved-tournament-1' });
      mockResolveTournamentId.mockResolvedValue('resolved-tournament-1');
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const { GET } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000');
      await GET(request, {
        params: Promise.resolve({ id: 'bm-spring-cup', matchId: 'match-123' }),
      });

      expect(mockResolveTournamentId).toHaveBeenCalledWith('bm-spring-cup');
      expect(mockCreateSuccessResponse).toHaveBeenCalledWith(mockMatch);
    });

    it('should return 404 via createErrorResponse when match not found', async () => {
      (prisma.bMMatch as any).findUnique.mockResolvedValue(null);

      const { GET } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000');
      await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      /* Factory now uses createErrorResponse with 404 (not handleValidationError) */
      expect(mockCreateErrorResponse).toHaveBeenCalledWith('Match not found', 404, 'NOT_FOUND');
    });

    it('should delegate database errors to handleDatabaseError', async () => {
      (prisma.bMMatch as any).findUnique.mockRejectedValue(new Error('DB error'));

      const { GET } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000');
      await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleDatabaseError).toHaveBeenCalledWith(new Error('DB error'), 'fetch match');
    });
  });

  // ============================================================
  // PUT Handler Tests
  // ============================================================

  describe('PUT Handler', () => {
    it('should apply sanitizeInput when sanitizeBody is true', async () => {
      const mockMatch = createMockMatch();
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };
      const sanitizedBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      mockSanitizeInput.mockReturnValue(sanitizedBody);

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        sanitizeBody: true,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockSanitizeInput).toHaveBeenCalledWith(mockRequestBody);
    });

    it('should execute updateMatchScore with correct arguments', async () => {
      const mockMatch = createMockMatch({ version: 1 });
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(config.updateMatchScore).toHaveBeenCalledWith(
        prisma,
        'match-123',
        1,
        3,
        1,
        true,
        []
      );
    });

    it('should return success response with match and version', async () => {
      const updatedMatch = createMockMatch({ version: 2, score1: 3, score2: 1 });
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue(updatedMatch);

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateSuccessResponse).toHaveBeenCalledWith({
        match: updatedMatch,
        version: 2,
      });
    });

    it('should return 400 when score fields are missing', async () => {
      const mockRequestBody = { score1: 3, version: 1 };

      const { PUT } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleValidationError).toHaveBeenCalledWith(
        'score1 and score2 are required',
        'scores'
      );
    });

    it('should return 400 when version is not a number', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 'invalid', rounds: [] };

      const { PUT } = createMatchDetailHandlers({ ...baseConfig });

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleValidationError).toHaveBeenCalledWith(
        'version is required and must be a number',
        'version'
      );
    });

    it('should return 400 when validateScores rejects (qualification match)', async () => {
      const mockRequestBody = { score1: 5, score2: 0, completed: true, version: 1, rounds: [] };

      // findUnique must return stage so the factory knows which validator to use
      (prisma.bMMatch as any).findUnique.mockResolvedValue({ stage: 'qualification' });

      const config = {
        ...baseConfig,
        validateScores: jest.fn().mockReturnValue({ isValid: false, error: 'Sum must be 4' }),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(config.validateScores).toHaveBeenCalledWith(5, 0);
      expect(mockHandleValidationError).toHaveBeenCalledWith('Sum must be 4', 'scores');
    });

    it('should use validateFinalsScores for finals matches', async () => {
      const mockRequestBody = { score1: 5, score2: 2, completed: true, version: 1, rounds: [] };

      // Stage = finals → validateFinalsScores is used instead of validateScores
      (prisma.bMMatch as any).findUnique.mockResolvedValue({ stage: 'finals' });

      const config = {
        ...baseConfig,
        validateScores: jest.fn(),
        validateFinalsScores: jest.fn().mockReturnValue({ isValid: true }),
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(config.validateScores).not.toHaveBeenCalled();
      expect(config.validateFinalsScores).toHaveBeenCalledWith(5, 2);
    });

    it('should return 400 when validateFinalsScores rejects (finals match)', async () => {
      const mockRequestBody = { score1: 4, score2: 3, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue({ stage: 'finals' });

      const config = {
        ...baseConfig,
        validateScores: jest.fn(),
        validateFinalsScores: jest.fn().mockReturnValue({ isValid: false, error: 'One player must reach 5 wins' }),
        updateMatchScore: jest.fn(),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(config.validateFinalsScores).toHaveBeenCalledWith(4, 3);
      expect(config.validateScores).not.toHaveBeenCalled();
      expect(mockHandleValidationError).toHaveBeenCalledWith('One player must reach 5 wins', 'scores');
      expect(config.updateMatchScore).not.toHaveBeenCalled();
    });

    it('should return 409 with currentVersion on OptimisticLockError', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockRejectedValue(new OptimisticLockError('Version conflict', 5)),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateErrorResponse).toHaveBeenCalledWith(
        'The match was modified by another user. Please refresh and try again.',
        409,
        'VERSION_CONFLICT',
        { currentVersion: 5 }
      );
    });

    it('should delegate database errors to handleDatabaseError on PUT', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockRejectedValue(new Error('DB write error')),
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleDatabaseError).toHaveBeenCalledWith(new Error('DB write error'), 'update match');
    });

    it('should return 403 when putRequiresAuth and user is not authenticated', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      mockAuth.mockResolvedValue(null);

      const config = {
        ...baseConfig,
        putRequiresAuth: true,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateErrorResponse).toHaveBeenCalledWith('Forbidden', 403, 'FORBIDDEN');
    });

    it('should return 403 when putRequiresAuth and user is not admin', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      mockAuth.mockResolvedValue({
        user: {
          id: 'user-1',
          role: 'member',
          userType: 'player',
        },
      });

      const config = {
        ...baseConfig,
        putRequiresAuth: true,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateErrorResponse).toHaveBeenCalledWith('Forbidden', 403, 'FORBIDDEN');
    });
  });

  // ============================================================
  // recalcStatsConfig Hook Tests (TC-402 regression coverage)
  //
  // Ensures that when a qualification-stage match PUT succeeds and the
  // route was wired with recalcStatsConfig, recalculatePlayerStats is
  // invoked once per player so the per-mode qualification aggregate
  // stays in sync with match state. Without this hook, GP's manual-
  // total admin score path left gPQualification rows at 0 across the
  // whole tournament, dropping GP qualification points to 0 for every
  // player in overall ranking.
  // ============================================================

  describe('PUT Handler — recalcStatsConfig hook', () => {
    const recalcConfig = {
      matchModel: 'bMMatch',
      qualificationModel: 'bMQualification',
      scoreFields: { p1: 'score1', p2: 'score2' },
      determineResult: (a: number, b: number) =>
        (a > b ? 'win' : a < b ? 'loss' : 'tie') as 'win' | 'loss' | 'tie',
      useRoundDifferential: true,
    };
    const qualificationMatch = {
      ...createMockMatch({ version: 2, score1: 3, score2: 1 }),
      stage: 'qualification',
      tournamentId: 'tournament-1',
      player1Id: 'player-1',
      player2Id: 'player-2',
    };
    const finalsMatch = { ...qualificationMatch, stage: 'finals' };
    const mockRequestBody = {
      score1: 3,
      score2: 1,
      completed: true,
      version: 1,
      rounds: [],
    };
    const mockRecalc = recalculatePlayerStats as jest.MockedFunction<
      typeof recalculatePlayerStats
    >;

    it('invokes recalculatePlayerStats for both players on qualification-stage PUT', async () => {
      /* Two findUnique calls: (1) stage lookup before updateMatchScore,
       * (2) updated match re-fetch after. Mock both with the same shape. */
      (prisma.bMMatch as any).findUnique.mockResolvedValue(qualificationMatch);

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        recalcStatsConfig: recalcConfig,
      };
      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockRecalc).toHaveBeenCalledTimes(2);
      expect(mockRecalc).toHaveBeenNthCalledWith(1, recalcConfig, 'tournament-1', 'player-1');
      expect(mockRecalc).toHaveBeenNthCalledWith(2, recalcConfig, 'tournament-1', 'player-2');
    });

    it('does not invoke recalculatePlayerStats when recalcStatsConfig is omitted', async () => {
      (prisma.bMMatch as any).findUnique.mockResolvedValue(qualificationMatch);

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
      };
      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockRecalc).not.toHaveBeenCalled();
    });

    it('does not invoke recalculatePlayerStats for finals-stage matches', async () => {
      (prisma.bMMatch as any).findUnique.mockResolvedValue(finalsMatch);

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        recalcStatsConfig: recalcConfig,
      };
      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockRecalc).not.toHaveBeenCalled();
    });

    it('still returns success when recalculatePlayerStats throws (logged, non-fatal)', async () => {
      (prisma.bMMatch as any).findUnique.mockResolvedValue(qualificationMatch);
      mockRecalc.mockRejectedValueOnce(new Error('recalc failed'));

      const config = {
        ...baseConfig,
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        recalcStatsConfig: recalcConfig,
      };
      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateSuccessResponse).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to recalculate qualification stats'),
        expect.objectContaining({ matchId: 'match-123' }),
      );
    });
  });
});
