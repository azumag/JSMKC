/**
 * @module Test Suite: /api/players/[id]/qr-login-token
 *
 * Tests for the QR one-scan login token API route (issue #3055):
 * - GET returns whether a token is active, without ever exposing the token/hash
 * - POST issues/reissues a token; the raw token is returned exactly once
 * - DELETE revokes the active token
 * - Both the player themself (session.user.playerId === id) and admins are
 *   authorized; other players and unauthenticated callers are rejected
 * - 404 when the player does not exist
 * - Audit log entries are written for issue/revoke
 *
 * Dependencies mocked:
 * - @/lib/auth: session/auth
 * - @/lib/prisma: database client
 * - @/lib/qr-login-token: generateQrLoginToken, hashQrLoginToken
 * - @/lib/audit-log: createAuditLog, AUDIT_ACTIONS
 * - @/lib/rate-limit: getServerSideIdentifier
 * - @/lib/logger: createLogger
 *
 * IMPORTANT: jest.mock() calls use the global jest (not @jest/globals) because
 * babel-jest hoisting does not work correctly when jest is imported from @jest/globals.
 */
// @ts-nocheck

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/qr-login-token', () => ({
  generateQrLoginToken: jest.fn(() => 'raw-generated-token'),
  hashQrLoginToken: jest.fn(() => Promise.resolve('hashed-token')),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    ISSUE_PLAYER_QR_TOKEN: 'ISSUE_PLAYER_QR_TOKEN',
    REVOKE_PLAYER_QR_TOKEN: 'REVOKE_PLAYER_QR_TOKEN',
  },
  resolveAuditUserId: jest.fn((s) => s?.user?.id ?? undefined),
}));

jest.mock('@/lib/rate-limit', () => ({
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

const mockLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => mockLoggerInstance),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      const h = init.headers || {};
      this.headers = {
        get: (key) => {
          if (h instanceof Headers) return h.get(key);
          if (h instanceof Map) return h.get(key);
          return h[key] || null;
        },
      };
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: { json: mockJson },
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateQrLoginToken, hashQrLoginToken } from '@/lib/qr-login-token';
import { createAuditLog } from '@/lib/audit-log';

describe('/api/players/[id]/qr-login-token', () => {
  const { NextResponse } = jest.requireMock('next/server');

  const adminSession = { user: { id: 'admin-1', role: 'admin' } };
  const selfSession = { user: { id: 'player-1', role: 'player', userType: 'player', playerId: 'player-1' } };
  const otherPlayerSession = { user: { id: 'player-2', role: 'player', userType: 'player', playerId: 'player-2' } };
  const playerParams = { params: Promise.resolve({ id: 'player-1' }) };
  const mockPlayer = { id: 'player-1', nickname: 'TestPlayer', qrLoginTokenHash: null, qrLoginTokenIssuedAt: null };

  function makeRequest(method = 'GET') {
    return new NextRequest('http://localhost:3000/api/players/player-1/qr-login-token', { method });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('returns active: false when no token has been issued', async () => {
      auth.mockResolvedValue(selfSession);
      prisma.player.findUnique.mockResolvedValue({ qrLoginTokenHash: null, qrLoginTokenIssuedAt: null });

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).GET;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { active: false, issuedAt: null } }),
      );
    });

    it('returns active: true with issuedAt when a token exists', async () => {
      auth.mockResolvedValue(selfSession);
      const issuedAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.player.findUnique.mockResolvedValue({ qrLoginTokenHash: 'some-hash', qrLoginTokenIssuedAt: issuedAt });

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).GET;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { active: true, issuedAt } }),
      );
      // Never expose the hash itself.
      const [body] = NextResponse.json.mock.calls[0];
      expect(JSON.stringify(body)).not.toContain('some-hash');
    });

    it('allows admins to check any player', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue({ qrLoginTokenHash: null, qrLoginTokenIssuedAt: null });

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).GET;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 403 for a different player', async () => {
      auth.mockResolvedValue(otherPlayerSession);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).GET;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ status: 403 }));
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    it('returns 403 when unauthenticated', async () => {
      auth.mockResolvedValue(null);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).GET;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ status: 403 }));
    });

    it('returns 404 when the player does not exist', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(null);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).GET;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Player not found' }),
        expect.objectContaining({ status: 404 }),
      );
    });
  });

  describe('POST (issue/reissue)', () => {
    it('generates a new token, persists only its hash, and returns the raw token once', async () => {
      auth.mockResolvedValue(selfSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue({ ...mockPlayer, qrLoginTokenHash: 'hashed-token' });

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(generateQrLoginToken).toHaveBeenCalled();
      expect(hashQrLoginToken).toHaveBeenCalledWith('raw-generated-token');
      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: { qrLoginTokenHash: 'hashed-token', qrLoginTokenIssuedAt: expect.any(Date) },
      });
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { token: 'raw-generated-token', issuedAt: expect.any(String) },
        }),
      );
    });

    it('allows an admin to issue a token for another player', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue(mockPlayer);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('reissuing invalidates the previous token (overwrites the single stored hash)', async () => {
      auth.mockResolvedValue(selfSession);
      prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, qrLoginTokenHash: 'old-hash' });
      prisma.player.update.mockResolvedValue(mockPlayer);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ISSUE_PLAYER_QR_TOKEN',
          details: expect.objectContaining({ reissued: true }),
        }),
      );
    });

    it('writes an audit log entry on success', async () => {
      auth.mockResolvedValue(selfSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue(mockPlayer);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ISSUE_PLAYER_QR_TOKEN',
          targetId: 'player-1',
          targetType: 'Player',
          details: expect.objectContaining({ playerNickname: 'TestPlayer', reissued: false }),
        }),
      );
    });

    it('returns 403 for a different player', async () => {
      auth.mockResolvedValue(otherPlayerSession);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ status: 403 }));
      expect(prisma.player.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the player does not exist', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(null);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Player not found' }),
        expect.objectContaining({ status: 404 }),
      );
    });

    it('returns 500 on unexpected database error', async () => {
      auth.mockResolvedValue(selfSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockRejectedValue(new Error('DB down'));

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).POST;
      await route(makeRequest('POST'), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Failed to issue QR login token' }),
        expect.objectContaining({ status: 500 }),
      );
    });
  });

  describe('DELETE (revoke)', () => {
    it('clears the stored token hash and returns active: false', async () => {
      auth.mockResolvedValue(selfSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue({ ...mockPlayer, qrLoginTokenHash: null });

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).DELETE;
      await route(makeRequest('DELETE'), playerParams);

      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: { qrLoginTokenHash: null, qrLoginTokenIssuedAt: null },
      });
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { active: false } }),
      );
    });

    it('writes an audit log entry on success', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue(mockPlayer);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).DELETE;
      await route(makeRequest('DELETE'), playerParams);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REVOKE_PLAYER_QR_TOKEN',
          targetId: 'player-1',
          targetType: 'Player',
        }),
      );
    });

    it('returns 403 for a different player', async () => {
      auth.mockResolvedValue(otherPlayerSession);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).DELETE;
      await route(makeRequest('DELETE'), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ status: 403 }));
      expect(prisma.player.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the player does not exist', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(null);

      const route = (await import('@/app/api/players/[id]/qr-login-token/route')).DELETE;
      await route(makeRequest('DELETE'), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Player not found' }),
        expect.objectContaining({ status: 404 }),
      );
    });
  });
});
