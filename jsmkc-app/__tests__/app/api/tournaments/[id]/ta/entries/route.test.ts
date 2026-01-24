// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

describe('GET /api/tournaments/[id]/ta/entries', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should redirect to main TA endpoint preserving search params', async () => {
      const mockData = {
        entries: [{ id: 'entry1', tournamentId: 't1' }],
        courses: ['MC1', 'MC2', 'MC3'],
        stage: 'qualification',
      };

      // Mock fetch to return mock data
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as Response)
      ) as jest.Mock;

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/entries?token=abc123'
      );

(jest.requireMock('@/app/api/tournaments/[id]/ta/entries/route') as any).GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tournaments/t1/ta'),
        expect.objectContaining({
          method: 'GET',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockData, { status: 200 });
    });

    it('should forward user agent header', async () => {
      const mockData = {
        entries: [],
        courses: ['MC1', 'MC2', 'MC3'],
        stage: 'qualification',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as Response)
      ) as jest.Mock;

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/entries',
        {
          headers: new Headers({ 'User-Agent': 'TestAgent/1.0' }),
        }
      );

(jest.requireMock('@/app/api/tournaments/[id]/ta/entries/route') as any).GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'TestAgent/1.0',
          }),
        })
      );
    });

    it('should handle empty search params', async () => {
      const mockData = {
        entries: [],
        courses: ['MC1', 'MC2', 'MC3'],
        stage: 'qualification',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as Response)
      ) as jest.Mock;

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/entries'
      );

(jest.requireMock('@/app/api/tournaments/[id]/ta/entries/route') as any).GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tournaments/t1/ta'),
        expect.objectContaining({
          method: 'GET',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockData, { status: 200 });
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      ) as jest.Mock;

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/entries'
      );

      await expect(
(jest.requireMock('@/app/api/tournaments/[id]/ta/entries/route') as any).GET(request, {
          params: Promise.resolve({ id: 't1' })
        })
      ).rejects.toThrow('Network error');
    });

    it('should forward upstream error responses', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal server error' }),
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as Response)
      ) as jest.Mock;

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/t1/ta/entries'
      );

(jest.requireMock('@/app/api/tournaments/[id]/ta/entries/route') as any).GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });
  });
});
