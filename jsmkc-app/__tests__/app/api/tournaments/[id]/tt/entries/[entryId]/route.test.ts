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
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { updateTTEntry, OptimisticLockError } from '@/lib/optimistic-locking';
import { GET, PUT } from '@/app/api/tournaments/[id]/tt/entries/[entryId]/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };
const jsonMock = NextResponseMock.NextResponse.json;

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
    jsonMock.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
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

      expect(result.data).toEqual(mockEntry);
      expect(result.status).toBe(200);
      expect(prisma.tTEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'e1' },
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
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch entry', { error: expect.any(Error), entryId: 'e1' });
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

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
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

      expect(result.data).toEqual({
        success: true,
        data: mockEntry,
        version: 2,
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

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
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

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
      expect(result.status).toBe(400);
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

      expect(result.data).toEqual({
        success: false,
        error: 'Version conflict',
        message: 'The entry was modified by another user. Please refresh and try again.',
        currentVersion: 5,
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
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update entry', { error: expect.any(Error), entryId: 'e1' });
    });

    it('should handle empty body gracefully', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/tt/entries/e1', {});
      const params = Promise.resolve({ id: 't1', entryId: 'e1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'version is required and must be a number' });
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

      expect(result.data.version).toBe(2);
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

      expect(prisma.tTEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'e1' },
        include: {
          player: true,
          tournament: true,
        },
      });
    });

    it('should handle invalid JSON body', async () => {
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
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
