/**
 * Unit tests for middleware.ts — auth gate and security headers.
 *
 * TC-2477: 非認証 POST /api/tournaments → 401 JSON を返す
 * TC-2478: GET /api/tournaments → auth 呼び出しなし、通過する
 * TC-2479: 非認証 /profile → /auth/signin にリダイレクト
 * TC-2480: auth() が throw したとき NextResponse.next() にフォールバック
 * TC-2481: x-nonce と x-pathname ヘッダーが転送リクエストに付与される
 */

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// All mock state lives inside the factory to avoid hoisting TDZ errors.
// Tests retrieve them via jest.requireMock('next/server').__mocks.
jest.mock('next/server', () => {
  const mockNextFn = jest.fn();
  const mockRedirectFn = jest.fn();
  const mockResponseHeaderSet = jest.fn();

  class MockResponseHeaders {
    private _map = new Map<string, string>();
    set(k: string, v: string) { this._map.set(k, v); mockResponseHeaderSet(k, v); }
    get(k: string) { return this._map.get(k) ?? null; }
    has(k: string) { return this._map.has(k); }
  }

  class MockNextResponse {
    body: unknown;
    status: number;
    headers = new MockResponseHeaders();
    _redirectUrl?: string;

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => this.headers.set(k, v));
      }
    }

    static next(opts?: { request?: { headers?: Headers } }) {
      const res = new MockNextResponse();
      mockNextFn(opts);
      return res;
    }

    static redirect(url: URL) {
      const res = new MockNextResponse(null, { status: 307 });
      res._redirectUrl = url.toString();
      mockRedirectFn(url.toString());
      return res;
    }
  }

  class MockNextRequest {
    url: string;
    method: string;
    nextUrl: { pathname: string };
    headers: Headers;

    constructor(url: string, init?: { method?: string }) {
      this.url = url;
      this.method = init?.method ?? 'GET';
      this.nextUrl = { pathname: new URL(url).pathname };
      this.headers = new Headers();
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
    // Expose mock fns so tests can assert on them
    __mocks: { mockNextFn, mockRedirectFn, mockResponseHeaderSet },
    __esModule: true,
  };
});

import { auth } from '@/lib/auth';
import middleware from '@/middleware';

const mockAuth = jest.mocked(auth);

type NextServerMock = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NextRequest: new (url: string, init?: { method?: string }) => any;
  __mocks: {
    mockNextFn: jest.Mock;
    mockRedirectFn: jest.Mock;
    mockResponseHeaderSet: jest.Mock;
  };
};

function getMocks() {
  return (jest.requireMock('next/server') as NextServerMock).__mocks;
}

function makeRequest(url: string, method = 'GET') {
  const { NextRequest } = jest.requireMock('next/server') as NextServerMock;
  return new NextRequest(url, { method });
}

beforeEach(() => {
  const { mockNextFn, mockRedirectFn, mockResponseHeaderSet } = getMocks();
  mockNextFn.mockClear();
  mockRedirectFn.mockClear();
  mockResponseHeaderSet.mockClear();
  mockAuth.mockClear();
});

describe('middleware — auth gate', () => {
  it('TC-2477: 非認証 POST /api/tournaments → 401 を返す', async () => {
    const { mockNextFn } = getMocks();
    mockAuth.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/tournaments', 'POST');

    const res = await middleware(req) as { status: number; body: unknown };

    // The 401 path uses new NextResponse(body, {status:401}) — not NextResponse.json()
    expect(res.status).toBe(401);
    expect(res.body).toContain('"Unauthorized"');
    // auth() must be called exactly once for protected mutating methods
    expect(mockAuth).toHaveBeenCalledTimes(1);
    // NextResponse.next() must NOT be called — we returned 401 early
    expect(mockNextFn).not.toHaveBeenCalled();
  });

  it('TC-2478: GET /api/tournaments → auth() 呼び出しなし、通過する', async () => {
    const { mockNextFn } = getMocks();
    const req = makeRequest('http://localhost/api/tournaments', 'GET');

    await middleware(req);

    // GET on protected API is public — auth() must NOT be called
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockNextFn).toHaveBeenCalledTimes(1);
  });

  it('TC-2479: 非認証 /profile → /auth/signin にリダイレクト', async () => {
    const { mockRedirectFn } = getMocks();
    mockAuth.mockResolvedValue(null);
    const req = makeRequest('http://localhost/profile', 'GET');

    const res = await middleware(req) as { _redirectUrl?: string };

    expect(mockRedirectFn).toHaveBeenCalledTimes(1);
    expect(res._redirectUrl).toContain('/auth/signin');
    expect(res._redirectUrl).toContain('callbackUrl=%2Fprofile');
  });

  it('TC-2480: auth() が throw したとき NextResponse.next() にフォールバック', async () => {
    const { mockNextFn } = getMocks();
    mockAuth.mockRejectedValue(new Error('auth failure'));
    const req = makeRequest('http://localhost/api/tournaments', 'POST');

    // Must not propagate — middleware wraps everything in try/catch
    await expect(middleware(req)).resolves.toBeDefined();
    expect(mockNextFn).toHaveBeenCalledTimes(1);
  });

  it('認証済みユーザーは保護された POST エンドポイントを通過する', async () => {
    const { mockNextFn } = getMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'admin' } } as Awaited<ReturnType<typeof auth>>);
    const req = makeRequest('http://localhost/api/tournaments', 'POST');

    const res = await middleware(req) as { status: number };

    expect(mockNextFn).toHaveBeenCalledTimes(1);
    expect(res.status).not.toBe(401);
  });

  it('DELETE /api/players も認証を要求する', async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/players/p1', 'DELETE');

    const res = await middleware(req) as { status: number; body: unknown };

    expect(res.status).toBe(401);
    expect(res.body).toContain('"Unauthorized"');
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });
});

describe('middleware — ヘッダー付与', () => {
  it('TC-2481: x-nonce と x-pathname が転送リクエストに付与される', async () => {
    const { mockNextFn } = getMocks();
    const req = makeRequest('http://localhost/api/tournaments', 'GET');

    await middleware(req);

    expect(mockNextFn).toHaveBeenCalledTimes(1);
    // The first argument to NextResponse.next() contains request.headers
    const nextCallArg = mockNextFn.mock.calls[0][0] as { request: { headers: Headers } };
    const fwdHeaders = nextCallArg?.request?.headers;
    expect(fwdHeaders).toBeDefined();
    // x-nonce must be a non-empty string (base64 nonce)
    expect(fwdHeaders.get('x-nonce')).toBeTruthy();
    // x-pathname must match the request path
    expect(fwdHeaders.get('x-pathname')).toBe('/api/tournaments');
  });

  it('セキュリティヘッダーが付与される (X-Frame-Options は常に DENY)', async () => {
    const { mockResponseHeaderSet } = getMocks();
    const req = makeRequest('http://localhost/', 'GET');

    await middleware(req);

    // Response headers set via addSecurityHeaders on the MockNextResponse
    const xFrameCall = mockResponseHeaderSet.mock.calls.find(([k]: [string]) => k === 'X-Frame-Options');
    const cspCall = mockResponseHeaderSet.mock.calls.find(([k]: [string]) => k === 'Content-Security-Policy');
    expect(xFrameCall?.[1]).toBe('DENY');
    expect(cspCall).toBeDefined();
  });
});
