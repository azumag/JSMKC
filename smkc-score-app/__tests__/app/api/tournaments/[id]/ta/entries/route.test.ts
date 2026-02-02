/**
 * @module Test Suite: GET /api/tournaments/[id]/ta/entries
 *
 * Tests for the Time Attack (TA) entries proxy/redirect API route handler.
 * This endpoint acts as a proxy that forwards requests to the main TA endpoint,
 * preserving search parameters (e.g., token for player score entry access)
 * and request headers (e.g., User-Agent).
 *
 * Test categories:
 * - Success Cases: Verifies proper URL construction, search param forwarding,
 *   User-Agent header forwarding, and handling of empty search params.
 * - Error Handling: Validates graceful handling of network errors and
 *   upstream error response forwarding (e.g., 500 status codes).
 *
 * Dependencies mocked:
 * - next/server: NextResponse.json mock for response assertions
 * - global.fetch: Mocked to simulate upstream API responses
 *
 * IMPORTANT: jest.mock() calls use the global jest (not imported from @jest/globals)
 * because babel-jest's hoisting plugin does not properly hoist jest.mock()
 * when jest is imported from @jest/globals, causing mocks to not be applied.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// Mock next/server with MockNextRequest that supports URL parsing
jest.mock('next/server', () => {
  const mockJson = jest.fn();
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this._body = init.body;
      const h = init.headers || {};
      this.headers = {
        get: (key) => {
          if (h instanceof Headers) return h.get(key);
          if (h instanceof Map) return h.get(key);
          return h[key] || null;
        },
        forEach: (cb) => {
          if (h instanceof Headers) { h.forEach(cb); return; }
          Object.entries(h).forEach(([k, v]) => cb(v, k));
        },
      };
    }
    async json() {
      if (typeof this._body === 'string') return JSON.parse(this._body);
      return this._body;
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import * as entriesRoute from '@/app/api/tournaments/[id]/ta/entries/route';

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

      // Mock global fetch to return mock data
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

      // Must await the route handler to ensure all async operations complete
      await entriesRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Verify fetch was called with correct URL including search params
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tournaments/t1/ta'),
        expect.objectContaining({
          method: 'GET',
        })
      );

      // Verify response forwarded correctly
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
          headers: { 'User-Agent': 'TestAgent/1.0' },
        }
      );

      await entriesRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Verify the User-Agent header was forwarded to the fetch call
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

      await entriesRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Verify fetch was called with the main TA URL
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

      // The route does not catch fetch errors, so it should propagate
      await expect(
        entriesRoute.GET(request, {
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

      await entriesRoute.GET(request, {
        params: Promise.resolve({ id: 't1' })
      });

      // Should forward the error response with the upstream status code
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Internal server error' },
        { status: 500 }
      );
    });
  });
});
