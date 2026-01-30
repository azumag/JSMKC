import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    UPDATE_PLAYER: 'UPDATE_PLAYER',
    DELETE_PLAYER: 'DELETE_PLAYER',
  },
}));

jest.mock('@/lib/rate-limit', () => ({
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this._body = init.body;
      const h = init.headers || {};
      this.headers = {
        get: (key) => h[key] || null,
        forEach: (cb) => Object.entries(h).forEach(([k, v]) => cb(v, k)),
      };
    }
    async json() {
      if (typeof this._body === 'string') return JSON.parse(this._body);
      return this._body;
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: { json: mockJson },
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

describe('Debug auth mock', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('auth mock should work with dynamic import', async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
    });

    // Verify mock is set
    const result = await (auth as jest.Mock)();
    console.log('Auth direct call result:', JSON.stringify(result));

    const route = (await import('@/app/api/players/[id]/route')).PUT;

    const request = new NextRequest('http://localhost:3000/api/players/player-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Name', nickname: 'updated' }),
    });

    await route(request, { params: Promise.resolve({ id: 'player-1' }) });

    console.log('NextResponse.json calls:', JSON.stringify(NextResponse.json.mock.calls));
    
    // Check what status was returned
    const callArgs = NextResponse.json.mock.calls[0];
    console.log('First call args:', JSON.stringify(callArgs));
  });
});
