/**
 * @module Locale Route Tests
 *
 * Test suite for the POST /api/locale endpoint.
 * This route sets the user's locale preference cookie.
 *
 * Covers:
 * - Valid locale: Sets NEXT_LOCALE cookie with correct value and attributes
 * - Invalid locale: Returns 400 for unsupported locale values
 * - Missing locale: Returns 400 when locale field is absent
 * - Malformed JSON: Returns 400 when request body is not valid JSON
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

jest.mock('@/i18n/config', () => ({
  locales: ['en', 'ja'],
  LOCALE_COOKIE: 'NEXT_LOCALE',
}));

/**
 * Mock next/server's NextResponse to support cookies in Node test environment.
 * The default next/jest testEnvironment: 'node' does not provide ResponseCookies
 * on NextResponse.json() results, causing response.cookies.set() to throw.
 */
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const headers = new Headers(init?.headers);

        const response = new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers,
        });

        /**
         * Attach a minimal cookies API that mirrors NextResponse.cookies.set().
         * Serializes cookie attributes into a standard Set-Cookie header value.
         */
        Object.defineProperty(response, 'cookies', {
          value: {
            set(name: string, value: string, options: Record<string, unknown> = {}) {
              const parts = [`${name}=${value}`];
              if (options.path) parts.push(`Path=${options.path}`);
              if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
              if (options.sameSite) {
                /* NextResponse capitalizes SameSite values (e.g. 'lax' → 'Lax') */
                const ss = String(options.sameSite);
                parts.push(`SameSite=${ss.charAt(0).toUpperCase() + ss.slice(1)}`);
              }
              response.headers.append('set-cookie', parts.join('; '));
            },
          },
        });

        return response;
      },
    },
  };
});

import { POST } from '@/app/api/locale/route';

/**
 * Helper to create a Request with JSON body.
 * Uses standard Request constructor (not NextRequest) matching the route signature.
 */
function createRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Helper to create a Request with invalid (non-JSON) body.
 * Triggers the catch block in the route handler.
 */
function createBadRequest(): Request {
  return new Request('http://localhost:3000/api/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
}

describe('Locale API Route - POST /api/locale', () => {
  it('should set NEXT_LOCALE cookie for valid locale "en"', async () => {
    const response = await POST(createRequest({ locale: 'en' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });

    /* Verify the cookie was set with correct attributes */
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('NEXT_LOCALE=en');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=31536000');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('should set NEXT_LOCALE cookie for valid locale "ja"', async () => {
    const response = await POST(createRequest({ locale: 'ja' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('NEXT_LOCALE=ja');
  });

  it('should return 400 for unsupported locale', async () => {
    const response = await POST(createRequest({ locale: 'fr' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual(expect.objectContaining({ success: false, error: 'Invalid locale' }));
  });

  it('should return 400 when locale is missing', async () => {
    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual(expect.objectContaining({ success: false, error: 'Invalid locale' }));
  });

  it('should return 400 when locale is null', async () => {
    const response = await POST(createRequest({ locale: null }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual(expect.objectContaining({ success: false, error: 'Invalid locale' }));
  });

  it('should return 400 for malformed JSON body', async () => {
    const response = await POST(createBadRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual(expect.objectContaining({ success: false, error: 'Invalid request body' }));
  });
});
