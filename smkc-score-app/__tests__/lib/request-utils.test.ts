/**
 * Tests for request-utils: getClientIdentifier and getUserAgent.
 *
 * Covers:
 * - CF header takes priority over x-real-ip and x-forwarded-for
 * - x-real-ip takes priority over x-forwarded-for
 * - x-forwarded-for extracts first IP in comma-separated list
 * - Falls back to 'unknown' when no header is present
 * - getUserAgent returns header value or 'unknown'
 *
 * Note: We mock next/server to control NextRequest's headers.get behavior
 * so each test runs against a predictable header map rather than the real
 * NextRequest's internal header resolution (which injects x-forwarded-for: 127.0.0.1).
 */

// jest.setup.js globally mocks @/lib/request-utils for factory tests.
// Unmock it here so we exercise the real implementation.
jest.unmock('@/lib/request-utils');
// getServerSideIdentifier uses next/headers; mock it to avoid import errors
jest.mock('next/headers', () => ({ headers: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: jest.fn(), error: jest.fn() }) }));

import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';

/** Minimal NextRequest-shaped object with only the headers.get the unit cares about. */
function makeRequest(entries: Record<string, string>) {
  // Lowercase all keys so that case-insensitive lookup in the impl always matches.
  const map = new Map<string, string>(
    Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
  } as Parameters<typeof getClientIdentifier>[0];
}

describe('getClientIdentifier', () => {
  it('returns cf-connecting-ip when present (highest priority)', () => {
    const req = makeRequest({
      'cf-connecting-ip': '1.2.3.4',
      'x-real-ip': '5.6.7.8',
      'x-forwarded-for': '9.10.11.12',
    });
    expect(getClientIdentifier(req)).toBe('1.2.3.4');
  });

  it('returns x-real-ip when cf-connecting-ip is absent', () => {
    const req = makeRequest({
      'x-real-ip': '5.6.7.8',
      'x-forwarded-for': '9.10.11.12',
    });
    expect(getClientIdentifier(req)).toBe('5.6.7.8');
  });

  it('returns first IP from x-forwarded-for when higher-priority headers are absent', () => {
    const req = makeRequest({ 'x-forwarded-for': '9.10.11.12, 13.14.15.16' });
    expect(getClientIdentifier(req)).toBe('9.10.11.12');
  });

  it('trims whitespace from x-forwarded-for first IP', () => {
    const req = makeRequest({ 'x-forwarded-for': '  9.10.11.12  , 13.14.15.16' });
    expect(getClientIdentifier(req)).toBe('9.10.11.12');
  });

  it('returns "unknown" when no identifying header is present', () => {
    const req = makeRequest({});
    expect(getClientIdentifier(req)).toBe('unknown');
  });
});

describe('getUserAgent', () => {
  it('returns user-agent header value', () => {
    const req = makeRequest({ 'user-agent': 'Mozilla/5.0 Playwright' });
    expect(getUserAgent(req)).toBe('Mozilla/5.0 Playwright');
  });

  it('returns "unknown" when user-agent header is absent', () => {
    const req = makeRequest({});
    expect(getUserAgent(req)).toBe('unknown');
  });
});
