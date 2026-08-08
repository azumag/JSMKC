/**
 * Shared `next/server` mock for API route tests (issue #2952).
 *
 * Provides a `MockNextRequest` whose `headers.get`/`headers.forEach` support
 * plain objects, `Headers`, and `Map` init values, plus a `NextResponse.json`
 * jest.fn. Test files wire it up with:
 *
 *     jest.mock('next/server', () => require('../../../helpers/mock-next-server'));
 *
 * (adjust the relative path for the test's directory depth). The mocked
 * `NextResponse.json` instance is per-module-registry; tests that need to
 * assert on it should `jest.requireMock('next/server').NextResponse.json`.
 */
export class MockNextRequest {
  url: string;
  method: string;
  private readonly _body: unknown;
  headers: {
    get: (key: string) => string | null;
    forEach: (cb: (value: string, key: string) => void) => void;
  };

  constructor(
    url: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> | Headers | Map<string, string> } = {},
  ) {
    this.url = url;
    this.method = init.method || 'GET';
    this._body = init.body;
    const h = init.headers || {};
    this.headers = {
      get: (key: string) => {
        if (h instanceof Headers) return h.get(key);
        if (h instanceof Map) return h.get(key) ?? null;
        return h[key] || null;
      },
      forEach: (cb: (value: string, key: string) => void) => {
        if (h instanceof Headers) {
          h.forEach((value, key) => cb(value, key));
          return;
        }
        Object.entries(h).forEach(([key, value]) => cb(value, key));
      },
    };
  }

  async json(): Promise<unknown> {
    if (typeof this._body === 'string') return JSON.parse(this._body);
    return this._body;
  }
}

export const mockNextResponseJson = jest.fn();

export function createNextServerMock() {
  return {
    __esModule: true,
    NextRequest: MockNextRequest,
    NextResponse: { json: mockNextResponseJson },
  };
}
