// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    tTEntry: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

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
import { createLogger } from '@/lib/logger';
import { updateTTEntry, OptimisticLockError } from '@/lib/optimistic-locking';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/tt/entries/[entryId]/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

class MockNextRequest {
  constructor(
    private url: string,
    private body?: unknown,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('TT Entry API Route - /api/tournaments/[id]/tt/entries/[entryId]', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    NextResponseMock.json.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
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
      expect(updateTTEntry).toHaveBeenCalledWith(
        prisma,
        'e1',
        1,
        {
          times: null,
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
