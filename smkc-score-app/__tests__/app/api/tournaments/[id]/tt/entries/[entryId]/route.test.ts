/**
 * @module Test Suite: /api/tournaments/[id]/tt/entries/[entryId]
 *
 * Tests for the Time Trial (TT) individual entry API route handler.
 * This endpoint supports GET (fetch single entry) and PUT (update with
 * optimistic locking) operations for time trial entries.
 *
 * Test categories:
 * - GET - Fetch single Time Trial entry:
 *   - Returns entry data with player and tournament information (200)
 *   - Returns 404 when entry is not found
 *   - Returns 500 when database query fails, with structured error logging
 *   - Handles invalid entry ID (UUID format) gracefully
 *
 * - PUT - Update Time Trial entry with optimistic locking:
 *   - Updates entry with all fields (times, totalTime, rank, eliminated, lives)
 *   - Updates entry with partial fields (only provided fields are updated)
 *   - Returns 400 when version is missing or not a number (required for optimistic locking)
 *   - Returns 409 on optimistic lock conflict (OptimisticLockError) with
 *     currentVersion for client-side retry/refresh
 *   - Returns 500 when update operation fails
 *   - Handles empty body and invalid JSON body gracefully
 *   - Verifies version increment on successful update
 *   - Confirms re-fetch of updated entry after successful update
 *
 * Dependencies mocked:
 * - @/lib/optimistic-locking: updateTTEntry function and OptimisticLockError class
 *   for concurrent update conflict detection (version field comparison)
 * - @/lib/logger: Structured Winston logging (function-level logger creation pattern)
 * - next/server: NextResponse.json mock for response assertions
 * - @/lib/prisma: Database client for TTEntry queries with player/tournament includes
 *
 * Note: Uses a custom MockNextRequest class instead of NextRequest from next/server
 * to avoid issues with the mocked next/server module.
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/optimistic-locking', () => ({
  updateTTEntry: jest.fn(),
  OptimisticLockError: class OptimisticLockError extends Error {
    constructor(message: string, public currentVersion: number) {
      super(message);
      this.name = 'OptimisticLockError';
    }
  },
}));

jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
/**
 * Mock error-handling module to return plain objects for assertion.
 * The real module calls NextResponse.json() internally, but we bypass
 * that to keep tests focused on route logic rather than response serialization.
 */
jest.mock('@/lib/error-handling', () => ({
  createErrorResponse: jest.fn((message: string, status = 500, code?: string, details?: unknown) => ({
    data: { success: false, error: message, ...(code ? { code } : {}), ...(details ? { details } : {}) },
    status,
  })),
  createSuccessResponse: jest.fn((data: unknown) => ({
    data: { success: true, data },
    status: 200,
  })),
  handleValidationError: jest.fn((message: string, field?: string) => ({
    data: { success: false, error: message, ...(field ? { field } : {}) },
    status: 400,
  })),
  handleAuthzError: jest.fn((message = 'Forbidden') => ({
    data: { success: false, error: message },
    status: 403,
  })),
  handleDatabaseError: jest.fn((_error: unknown, context: string) => ({
    data: { success: false, error: `Failed to ${context}` },
    status: 500,
  })),
}));
// Mock freeze-check: default to "not frozen" for all existing tests
jest.mock('@/lib/ta/freeze-check', () => ({
  checkStageFrozen: jest.fn(() => Promise.resolve(null)),
}));
// Mock rank-calculation: recalculateRanks is a side-effect called after time updates;
// the unit tests for this route only verify the API contract, not ranking logic.
jest.mock('@/lib/ta/rank-calculation', () => ({
  recalculateRanks: jest.fn(() => Promise.resolve()),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { updateTTEntry, OptimisticLockError } from '@/lib/optimistic-locking';
import { GET, PUT } from '@/app/api/tournaments/[id]/tt/entries/[entryId]/route';

class MockNextRequest {
  private _headers: Map<string, string>;

  constructor(
    private url: string,
    private body?: unknown,
    headers?: Map<string, string>
  ) {
    this._headers = headers || new Map();
  }
  async json() { return this.body; }
  get header() { return { get: (key: string) => this._headers.get(key) }; }
  headers = {
    get: (key: string) => this._headers.get(key)
  };
}

describe('TT Entry API Route - /api/tournaments/[id]/tt/entries/[entryId]', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
  });

  describe('GET - Fetch single Time Trial entry', () => {
    it('should return entry data with player and tournament information', async () => {
      const mockEntry = {
        id: 'e1',
        playerId: 'p1',
        tournamentId: 't1',
        times: [1000, 2000],
        totalTime: 3000,
        rank: 1,
        eliminated: false,
        lives: 3,
        stage: 'qualification',
        version: 1,
        player: {
          id: 'p1',
          name: 'Player 1',
          nickname: 'P1',
        },
        tournament: {
          id: 't1',
          name: 'Test Tournament',
        },
      };

      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1');
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: true, data: mockEntry });
      expect(result.status).toBe(200);
      expect(prisma.tTEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'e1', tournamentId: 't1' },
        include: {
          player: true,
          tournament: true,
        },
      });
    });

    it('should return 404 when entry is not found', async () => {
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1');
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Entry not found' });
      expect(result.status).toBe(404);
    });

    it('should return 500 when database query fails', async () => {
      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1');
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch time trial entry' });
      expect(result.status).toBe(500);
      /* Logger is called before handleDatabaseError, so both are invoked */
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch entry', { error: expect.any(Error), entryId: 'e1', tournamentId: 't1' });
    });

    it('should handle invalid entry ID gracefully', async () => {
      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/invalid-id');
      const params = Promise.resolve({ id: 't1', entryId: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('PUT - Update Time Trial entry with optimistic locking', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000, 2000],
        totalTime: 3000,
        rank: 1,
        eliminated: false,
        lives: 3,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin and not player
    it('should return 403 when user is not admin and not player', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000, 2000],
        totalTime: 3000,
        rank: 1,
        eliminated: false,
        lives: 3,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden' });
      expect(result.status).toBe(403);
    });

    // Authorization: player can update their own entry
    it('should allow player to update their own entry', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'p1', role: 'member', userType: 'player', playerId: 'p1' },
      });

      // findUnique call order for player path with times:
      //   1. ownership+freeze check (select: { playerId, stage, tournamentId })
      //   2. recalculate stage lookup (select: { stage, tournamentId }) — added when times is updated
      //   3. re-fetch after update (include: { player, tournament })
      const mockEntryFull = {
        id: 'e1',
        playerId: 'p1',
        tournamentId: 't1',
        times: [1000],
        totalTime: 1000,
        rank: 1,
        eliminated: false,
        lives: 3,
        stage: 'qualification',
        version: 2,
        player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        tournament: { id: 't1', name: 'Test Tournament' },
      };

      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ playerId: 'p1', stage: 'qualification', tournamentId: 't1' })  // ownership check
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' })                  // recalculate lookup
        .mockResolvedValueOnce(mockEntryFull);                                                   // re-fetch after update

      const updateResult = { id: 'e1', version: 2 };
      (updateTTEntry as jest.Mock).mockResolvedValue(updateResult);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);
    });

    // Authorization: player cannot update another player's entry
    it('should return 403 when player tries to update another player\'s entry', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'p1', role: 'member', userType: 'player', playerId: 'p1' },
      });

      // Entry belongs to a different player (p2)
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce({ playerId: 'p2' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden' });
      expect(result.status).toBe(403);
    });

    // Authorization: player cannot update non-existent entry
    it('should return 403 when player tries to update non-existent entry', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'p1', role: 'member', userType: 'player', playerId: 'p1' },
      });

      // Entry doesn't exist
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden' });
      expect(result.status).toBe(403);
    });

    it('should update entry with all fields successfully', async () => {
      const mockEntry = {
        id: 'e1',
        playerId: 'p1',
        tournamentId: 't1',
        times: [1000, 2000],
        totalTime: 3000,
        rank: 1,
        eliminated: false,
        lives: 3,
        stage: 'qualification',
        version: 2,
        player: {
          id: 'p1',
          name: 'Player 1',
          nickname: 'P1',
        },
        tournament: {
          id: 't1',
          name: 'Test Tournament',
        },
      };

      const updateResult = { id: 'e1', version: 2 };

      (updateTTEntry as jest.Mock).mockResolvedValue(updateResult);
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000, 2000],
        totalTime: 3000,
        rank: 1,
        eliminated: false,
        lives: 3,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      /* createSuccessResponse wraps data: version is merged into the entry spread */
      expect(result.data).toEqual({
        success: true,
        data: { ...mockEntry, version: 2 },
      });
      expect(result.status).toBe(200);
      expect(updateTTEntry).toHaveBeenCalledWith(
        prisma,
        'e1',
        1,
        {
          times: [1000, 2000],
          totalTime: 3000,
          rank: 1,
          eliminated: false,
          lives: 3,
        }
      );
    });

    it('should update entry with partial fields', async () => {
      const mockEntry = {
        id: 'e1',
        playerId: 'p1',
        tournamentId: 't1',
        times: null,
        totalTime: 3000,
        rank: 2,
        eliminated: true,
        lives: 0,
        stage: 'qualification',
        version: 2,
        player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        tournament: { id: 't1', name: 'Test Tournament' },
      };

      const updateResult = { id: 'e1', version: 2 };

      (updateTTEntry as jest.Mock).mockResolvedValue(updateResult);
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        totalTime: 3000,
        rank: 2,
        eliminated: true,
        lives: 0,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      // When times is not provided in the request body, JavaScript destructuring
      // yields undefined (not null). The source passes this value through to updateTTEntry.
      expect(updateTTEntry).toHaveBeenCalledWith(
        prisma,
        'e1',
        1,
        {
          times: undefined,
          totalTime: 3000,
          rank: 2,
          eliminated: true,
          lives: 0,
        }
      );
    });

    it('should return 400 when version is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toMatchObject({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    it('should return 400 when version is not a number', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 'not-a-number',
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toMatchObject({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    it('should return 400 when times is partial (fewer than 20 courses)', async () => {
      /* Admin freeze check must pass before validation is reached */
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' });

      // Only 2 courses supplied — all 20 are required (issue #624).
      // Use correct M:SS.mm format so the format check passes and only the partial-times check fires.
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: { MC1: '1:24.00', DP1: '1:05.00' },
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({ success: false, field: 'times' });
      expect(result.data.error).toMatch(/times must include all 20 courses/);
      expect(updateTTEntry).not.toHaveBeenCalled();
    });

    it('should return 400 when times has all 20 keys but some are empty strings', async () => {
      /* Admin freeze check must pass before validation is reached */
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' });

      // Build a times object with all 20 courses but leave RR empty.
      // Use correct M:SS.mm format so the format check passes for non-empty entries.
      const partialTimes = Object.fromEntries(
        ['MC1','DP1','GV1','BC1','MC2','CI1','GV2','DP2','BC2','MC3',
         'KB1','CI2','VL1','BC3','MC4','DP3','KB2','GV3','VL2','RR']
          .map((c) => [c, c === 'RR' ? '' : '1:24.00'])
      );
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: partialTimes,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(400);
      expect(result.data).toMatchObject({ success: false, field: 'times' });
      expect(updateTTEntry).not.toHaveBeenCalled();
    });

    it('should return 400 when times contain seconds greater than 59', async () => {
      /* Admin freeze check must pass before validation is reached */
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: { MC1: '0:84:00' },
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toMatchObject({ success: false, error: 'Invalid time format for MC1: 0:84:00', field: 'times' });
      expect(result.status).toBe(400);
      expect(updateTTEntry).not.toHaveBeenCalled();
    });

    it('should return 400 when times contain malformed strings', async () => {
      /* Admin freeze check must pass before validation is reached */
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: { MC1: '1:23' },
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toMatchObject({ success: false, error: 'Invalid time format for MC1: 1:23', field: 'times' });
      expect(result.status).toBe(400);
      expect(updateTTEntry).not.toHaveBeenCalled();
    });

    it('should return 409 on optimistic lock conflict', async () => {
      const error = new OptimisticLockError('Version conflict', 5);

      (updateTTEntry as jest.Mock).mockRejectedValue(error);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toMatchObject({
        success: false,
        error: 'The entry was modified by another user. Please refresh and try again.',
      });
      expect(result.status).toBe(409);
    });

    it('should return 500 when update operation fails', async () => {
      (updateTTEntry as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update time trial entry' });
      expect(result.status).toBe(500);
      /* Logger is called before handleDatabaseError */
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update entry', { error: expect.any(Error), entryId: 'e1' });
    });

    it('should handle empty body gracefully', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {});
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toMatchObject({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
    });

    it('should increment version on successful update', async () => {
      const mockEntry = {
        id: 'e1',
        playerId: 'p1',
        tournamentId: 't1',
        times: [1000],
        totalTime: 1000,
        rank: 1,
        eliminated: false,
        lives: 3,
        stage: 'qualification',
        version: 2,
        player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        tournament: { id: 't1', name: 'Test Tournament' },
      };

      const updateResult = { id: 'e1', version: 2 };

      (updateTTEntry as jest.Mock).mockResolvedValue(updateResult);
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      /* version is merged into the data object via spread */
      expect(result.data.data.version).toBe(2);
    });

    it('should retrieve updated entry after update', async () => {
      const mockEntry = {
        id: 'e1',
        playerId: 'p1',
        tournamentId: 't1',
        times: [1000],
        totalTime: 1000,
        rank: 1,
        eliminated: false,
        lives: 3,
        stage: 'qualification',
        version: 2,
        player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
        tournament: { id: 't1', name: 'Test Tournament' },
      };

      const updateResult = { id: 'e1', version: 2 };

      (updateTTEntry as jest.Mock).mockResolvedValue(updateResult);
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      await PUT(request, { params });

      /* The post-update re-fetch uses `where: { id }` without tournamentId
       * (see route.ts line ~198). IDOR is already enforced by the earlier
       * freeze-check / auth-check reads. */
      expect(prisma.tTEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'e1' },
        include: {
          player: true,
          tournament: true,
        },
      });
    });

    // #273: Returns 404 when entry is deleted between update and re-fetch
    it('should return 404 when updatedEntry is null after update', async () => {
      const updateResult = { id: 'e1', version: 2 };
      (updateTTEntry as jest.Mock).mockResolvedValue(updateResult);
      /* findUnique call order for admin path with times:
       *   1. admin freeze check → valid entry
       *   2. recalculate stage lookup → valid entry (times !== undefined triggers this)
       *   3. re-fetch after update → null (simulates entry deleted mid-flight, issue #273) */
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' })  // freeze check
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' })  // recalculate lookup
        .mockResolvedValueOnce(null);                                            // final re-fetch → 404

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {
        times: [1000],
        totalTime: 1000,
        version: 1,
      });
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(404);
      expect(result.data).toEqual({ success: false, error: 'Entry not found after update', code: 'NOT_FOUND' });
    });

    it('should handle invalid JSON body', async () => {
      /* Admin freeze check must pass before JSON parsing is reached */
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ stage: 'qualification', tournamentId: 't1' });

      class MockRequestInvalid {
        async json() { throw new Error('Invalid JSON'); }
        get header() { return { get: () => undefined }; }
        headers = { get: () => undefined };
      }

      const request = new MockRequestInvalid() as NextRequest;
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update time trial entry' });
      expect(result.status).toBe(500);
    });
  });
});
