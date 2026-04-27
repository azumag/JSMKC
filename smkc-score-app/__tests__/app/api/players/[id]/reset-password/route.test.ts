/**
 * @module Test Suite: POST /api/players/[id]/reset-password
 *
 * Tests for the player password reset API route.
 * Verifies:
 * - Admin can reset a player's password and receives the plaintext password once
 * - Non-admin and unauthenticated requests are rejected with 403
 * - 404 is returned when the player does not exist
 * - Prisma P2025 (record not found) is mapped to 404
 * - Audit log is written on success
 * - Server errors produce 500
 *
 * Dependencies mocked:
 * - @/lib/auth: session/auth
 * - @/lib/prisma: database client
 * - @/lib/password-utils: generateSecurePassword, hashPassword
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

jest.mock('@/lib/password-utils', () => ({
  generateSecurePassword: jest.fn(() => 'generated-plain-pw'),
  hashPassword: jest.fn(() => Promise.resolve('hashed-pw')),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    RESET_PLAYER_PASSWORD: 'RESET_PLAYER_PASSWORD',
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
      this.method = init.method || 'POST';
      this._body = init.body;
      const h = init.headers || {};
      this.headers = {
        get: (key) => {
          if (h instanceof Headers) return h.get(key);
          if (h instanceof Map) return h.get(key);
          return h[key] || null;
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
    NextResponse: { json: mockJson },
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateSecurePassword, hashPassword } from '@/lib/password-utils';
import { createAuditLog } from '@/lib/audit-log';

const loggerMock = jest.requireMock('@/lib/logger');

describe('POST /api/players/[id]/reset-password', () => {
  const { NextResponse } = jest.requireMock('next/server');

  const adminSession = { user: { id: 'admin-1', role: 'admin' } };
  const playerParams = { params: Promise.resolve({ id: 'player-1' }) };
  const mockPlayer = { id: 'player-1', nickname: 'TestPlayer' };

  function makeRequest() {
    return new NextRequest('http://localhost:3000/api/players/player-1/reset-password', {
      method: 'POST',
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should generate a new password and return it once to the admin', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue({ ...mockPlayer, password: 'hashed-pw' });

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(generateSecurePassword).toHaveBeenCalledWith(12);
      expect(hashPassword).toHaveBeenCalledWith('generated-plain-pw');
      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: { password: 'hashed-pw' },
      });
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { temporaryPassword: 'generated-plain-pw' },
        }),
      );
    });

    it('should write an audit log entry on success', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue(mockPlayer);

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESET_PLAYER_PASSWORD',
          targetId: 'player-1',
          targetType: 'Player',
          details: expect.objectContaining({ playerNickname: 'TestPlayer', passwordRegenerated: true }),
        }),
      );
    });

    it('should continue and return success even if audit log throws', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockResolvedValue(mockPlayer);
      createAuditLog.mockRejectedValue(new Error('DB down'));

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });
  });

  describe('Authorization', () => {
    it('should return 403 when unauthenticated', async () => {
      auth.mockResolvedValue(null);

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ status: 403 }),
      );
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    it('should return 403 for a non-admin player session', async () => {
      auth.mockResolvedValue({ user: { id: 'player-1', role: 'player' } });

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ status: 403 }),
      );
    });
  });

  describe('Not Found', () => {
    it('should return 404 when player does not exist', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(null);

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Player not found' }),
        expect.objectContaining({ status: 404 }),
      );
    });

    it('should return 404 when Prisma throws P2025 (record not found)', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      const prismaNotFound = Object.assign(new Error('Not found'), { code: 'P2025' });
      prisma.player.update.mockRejectedValue(prismaNotFound);

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Player not found' }),
        expect.objectContaining({ status: 404 }),
      );
    });
  });

  describe('Server Error', () => {
    it('should return 500 on unexpected database error', async () => {
      auth.mockResolvedValue(adminSession);
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.update.mockRejectedValue(new Error('DB connection lost'));

      const route = (await import('@/app/api/players/[id]/reset-password/route')).POST;
      await route(makeRequest(), playerParams);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Failed to reset password' }),
        expect.objectContaining({ status: 500 }),
      );
      expect(mockLoggerInstance.error).toHaveBeenCalled();
    });
  });
});
