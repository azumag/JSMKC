/**
 * @module Test Suite: qr-login-token
 *
 * Tests for the QR one-scan login token utilities (issue #3055):
 * - generateQrLoginToken produces high-entropy, URL-safe tokens
 * - hashQrLoginToken is deterministic and produces a fixed-length hex digest
 * - Different tokens hash to different values (no trivial collisions)
 */

import { generateQrLoginToken, hashQrLoginToken } from '@/lib/qr-login-token';

describe('generateQrLoginToken', () => {
  it('returns a URL-safe base64 string with no padding characters', () => {
    const token = generateQrLoginToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });

  it('generates tokens long enough to encode 256 bits of entropy', () => {
    const token = generateQrLoginToken();
    // 32 raw bytes base64url-encoded (no padding) is at least 42 chars.
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('generates a different token on every call', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateQrLoginToken()));
    expect(tokens.size).toBe(20);
  });
});

describe('hashQrLoginToken', () => {
  it('produces a 64-character lowercase hex SHA-256 digest', async () => {
    const hash = await hashQrLoginToken('example-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', async () => {
    const hashA = await hashQrLoginToken('same-token');
    const hashB = await hashQrLoginToken('same-token');
    expect(hashA).toBe(hashB);
  });

  it('produces different hashes for different tokens', async () => {
    const hashA = await hashQrLoginToken('token-a');
    const hashB = await hashQrLoginToken('token-b');
    expect(hashA).not.toBe(hashB);
  });
});
