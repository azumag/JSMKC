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

import { auth } from '@/lib/auth';
import { sanitizeInput } from '@/lib/sanitize';
import { createSuccessResponse, createErrorResponse, handleValidationError, handleDatabaseError } from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Match Detail Route Factory', () => {
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockSanitizeInput: jest.MockedFunction<typeof sanitizeInput>;
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
});
