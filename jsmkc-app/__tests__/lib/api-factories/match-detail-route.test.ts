/**
 * @module __tests__/lib/api-factories/match-detail-route.test.ts
 *
 * Test suite for match detail route factory from `@/lib/api-factories/match-detail-route`.
 *
 * This suite validates the factory function that generates GET/PUT handlers for
 * individual match API routes. Tests cover:
 *
 * - GET handler: Fetching match with player details
 *   - Structured response style (BM pattern) using createSuccessResponse
 *   - Raw response style (MR/GP pattern) using NextResponse.json
 *   - 404 handling when match not found
 *   - 500 error handling for database errors
 * - PUT handler: Updating match score with optimistic locking
 *   - Authentication requirement (putRequiresAuth)
 *   - Input sanitization (sanitizeBody)
 *   - Version validation
 *   - Score field validation
 *   - OptimisticLockError handling with currentVersion in response
 *   - Response style variations (structured vs raw)
 *
 * Tests mock all dependencies including prisma, auth, sanitize, error-handling,
 * and logger to isolate the factory function behavior.
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
  // GET Handler Tests (4 cases)
  // ============================================================

  describe('GET Handler', () => {
    it('should return structured response when responseStyle is structured', async () => {
      const mockMatch = createMockMatch();
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'structured' as const,
      };

      const { GET } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateSuccessResponse).toHaveBeenCalledWith(mockMatch);
      expect((prisma.bMMatch as any).findUnique).toHaveBeenCalledWith({
        where: { id: 'match-123' },
        include: { player1: true, player2: true },
      });
    });

    it('should return raw response when responseStyle is raw', async () => {
      const mockMatch = createMockMatch();
      (prisma.mRMatch as any).findUnique.mockResolvedValue(mockMatch);

      const config = {
        matchModel: 'mRMatch',
        loggerName: 'mr-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'raw' as const,
        getErrorMessage: 'Failed to fetch MR match',
        includeSuccessInGetErrors: true,
      };

      const { GET } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      // Should return NextResponse.json with match data (no success wrapper for GET)
      expect(response.status).toBe(200);
      expect((prisma.mRMatch as any).findUnique).toHaveBeenCalledWith({
        where: { id: 'match-123' },
        include: { player1: true, player2: true },
      });
    });

    it('should return 404 when match not found (structured style)', async () => {
      (prisma.bMMatch as any).findUnique.mockResolvedValue(null);

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'structured' as const,
      };

      const { GET } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleValidationError).toHaveBeenCalledWith('Match not found', 'matchId');
    });

    it('should return 404 when match not found (raw style)', async () => {
      (prisma.mRMatch as any).findUnique.mockResolvedValue(null);

      const config = {
        matchModel: 'mRMatch',
        loggerName: 'mr-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'raw' as const,
        includeSuccessInGetErrors: true,
      };

      const { GET } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(response.status).toBe(404);
      expect(response.json()).resolves.toEqual({ success: false, error: 'Match not found' });
    });

    it('should return 500 on database error (structured style)', async () => {
      (prisma.bMMatch as any).findUnique.mockRejectedValue(new Error('DB error'));

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'structured' as const,
      };

      const { GET } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleDatabaseError).toHaveBeenCalledWith(new Error('DB error'), 'fetch match');
    });

    it('should return 500 on database error (raw style)', async () => {
      (prisma.mRMatch as any).findUnique.mockRejectedValue(new Error('DB error'));

      const config = {
        matchModel: 'mRMatch',
        loggerName: 'mr-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'raw' as const,
        getErrorMessage: 'Failed to fetch match',
        getLogMessage: 'Failed to fetch MR match',
      };

      const { GET } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch MR match', {
        error: expect.any(Error),
        matchId: 'match-123',
      });
    });
  });

  // ============================================================
  // PUT Handler Tests (8 cases)
  // ============================================================

  describe('PUT Handler', () => {
    it('should apply sanitizeInput when sanitizeBody is true', async () => {
      const mockMatch = createMockMatch();
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };
      const sanitizedBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...mockMatch, version: 2 });
      mockSanitizeInput.mockReturnValue(sanitizedBody);

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        sanitizeBody: true,
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockSanitizeInput).toHaveBeenCalledWith(mockRequestBody);
    });

    it('should execute updateMatchScore when version check passes', async () => {
      const mockMatch = createMockMatch({ version: 1 });
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...mockMatch, version: 2 });

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
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

    it('should return structured success response', async () => {
      const mockMatch = createMockMatch({ version: 1 });
      const updatedMatch = createMockMatch({ version: 2, score1: 3, score2: 1 });
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.bMMatch as any).findUnique.mockResolvedValue(updatedMatch);

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateSuccessResponse).toHaveBeenCalledWith({
        match: updatedMatch,
        version: 2,
      });
    });

    it('should return raw success response', async () => {
      const mockMatch = createMockMatch({ version: 1 });
      const updatedMatch = createMockMatch({ version: 2, score1: 3, score2: 1 });
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      (prisma.mRMatch as any).findUnique.mockResolvedValue(updatedMatch);

      const config = {
        matchModel: 'mRMatch',
        loggerName: 'mr-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn().mockResolvedValue({ version: 2 }),
        responseStyle: 'raw' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(response.status).toBe(200);
      expect(response.json()).resolves.toEqual({
        success: true,
        data: updatedMatch,
        version: 2,
      });
    });

    it('should return 400 when val1 or val2 is undefined', async () => {
      const mockRequestBody = { score1: 3, version: 1 };

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleValidationError).toHaveBeenCalledWith(
        'score1 and score2 are required',
        'scores'
      );
    });

    it('should return 400 when version is not a number', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 'invalid', rounds: [] };

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockHandleValidationError).toHaveBeenCalledWith(
        'version is required and must be a number',
        'version'
      );
    });

    it('should return 409 with currentVersion on OptimisticLockError (structured)', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn().mockRejectedValue(new OptimisticLockError('Version conflict', 5)),
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateErrorResponse).toHaveBeenCalledWith(
        'The match was modified by another user. Please refresh and try again.',
        409,
        'VERSION_CONFLICT',
        { currentVersion: 5 }
      );
    });

    it('should return 409 with currentVersion on OptimisticLockError (raw)', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      const config = {
        matchModel: 'mRMatch',
        loggerName: 'mr-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn().mockRejectedValue(new OptimisticLockError('Version conflict', 5)),
        responseStyle: 'raw' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(response.status).toBe(409);
      expect(response.json()).resolves.toEqual({
        success: false,
        error: 'Version conflict',
        message: 'The match was modified by another user. Please refresh and try again.',
        currentVersion: 5,
      });
    });

    it('should return 403 when putRequiresAuth and user is not authenticated', async () => {
      const mockRequestBody = { score1: 3, score2: 1, completed: true, version: 1, rounds: [] };

      mockAuth.mockResolvedValue(null);

      const config = {
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        putRequiresAuth: true,
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
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
        matchModel: 'bMMatch',
        loggerName: 'bm-match',
        scoreFields: { field1: 'score1', field2: 'score2' },
        detailField: 'rounds',
        updateMatchScore: jest.fn(),
        putRequiresAuth: true,
        responseStyle: 'structured' as const,
      };

      const { PUT } = createMatchDetailHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(mockRequestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-1', matchId: 'match-123' }),
      });

      expect(mockCreateErrorResponse).toHaveBeenCalledWith('Forbidden', 403, 'FORBIDDEN');
    });
  });
});
