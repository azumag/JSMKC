/**
 * @module Player [id] Route Tests
 *
 * Test suite for the /api/players/[id] endpoint covering GET, PUT, and DELETE methods.
 *
 * GET /api/players/[id]:
 * - Returns player data by ID
 * - Returns 404 when player not found
 * - Handles database errors with 500 status
 *
 * PUT /api/players/[id]:
 * - Updates player data (name, nickname, country)
 * - Requires admin authentication (returns 403 for non-admin/unauthenticated)
 * - Validates required fields (name, nickname) with 400 status
 * - Handles not found (P2025) with 404 and unique constraint violations (P2002) with 409
 * - Creates audit log entries on successful updates
 *
 * DELETE /api/players/[id]:
 * - Performs soft delete on the player record
 * - Requires admin authentication (returns 403 for non-admin/unauthenticated)
 * - Creates audit log entries on successful deletion
 * - Handles not found (P2025) with 404 and database errors with 500
 *
 * IMPORTANT: Uses @ts-nocheck and global jest (not @jest/globals).
 * jest.mock factory functions run in the global jest context due to hoisting.
 * Using global jest throughout avoids mock identity mismatches.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// Mock dependencies


jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/pagination', () => ({
  paginate: jest.fn(),
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

// Logger mock: stable reference to shared logger instance so tests can
// verify logger calls even after clearAllMocks resets call history.
const mockLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => mockLoggerInstance),
}));

// Custom next/server mock matching the pattern used in working tournament tests.
// Overrides the global jest.setup.js mock to ensure consistent behavior.
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
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

const auditLogMock = jest.requireMock('@/lib/audit-log');
const sanitizeMock = jest.requireMock('@/lib/sanitize');
const rateLimitMock = jest.requireMock('@/lib/rate-limit');
const loggerMock = jest.requireMock('@/lib/logger');

describe('GET /api/players/[id]', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire createLogger after clearAllMocks clears call history
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return player data when found', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Test Player',
        nickname: 'test',
      };

      prisma.player.findUnique.mockResolvedValue(mockPlayer);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'GET',
      });

      const route = (await import('@/app/api/players/[id]/route')).GET;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-1' }
      });
      expect(NextResponse.json).toHaveBeenCalledWith(mockPlayer);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when player not found', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'GET',
      });

      const route = (await import('@/app/api/players/[id]/route')).GET;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 500 on database error', async () => {
      prisma.player.findUnique.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'GET',
      });

      const route = (await import('@/app/api/players/[id]/route')).GET;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch player',
        }),
        { status: 500 }
      );
    });
  });
});

describe('PUT /api/players/[id]', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire logger mock after clearAllMocks
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
    // Set up admin auth by default for PUT tests since all PUT operations
    // require admin authentication. Individual tests can override this.
    auth.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      // Override the default admin auth with unauthenticated state
      auth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });
  });

  describe('Validation', () => {
    it('should return 400 when name is missing', async () => {
      sanitizeMock.sanitizeInput.mockReturnValue({ nickname: 'updated' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });

    it('should return 400 when nickname is missing', async () => {
      sanitizeMock.sanitizeInput.mockReturnValue({ name: 'Updated Name' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should update player successfully with valid data', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Updated Name',
        nickname: 'updated',
        country: 'US',
      };

      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Updated Name',
        nickname: 'updated',
        country: 'US',
      });
      prisma.player.update.mockResolvedValue(mockPlayer);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Updated Name',
          nickname: 'updated',
          country: 'US',
        }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(prisma.player.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'player-1' },
          data: {
            name: 'Updated Name',
            nickname: 'updated',
            country: 'US',
          },
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'UPDATE_PLAYER',
          targetId: 'player-1',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockPlayer);
    });

    it('should create audit log on successful update', async () => {
      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Updated Name',
        nickname: 'updated',
      });
      prisma.player.update.mockResolvedValue({
        id: 'player-1',
      });
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({ name: 'Updated Name', nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(auditLogMock.createAuditLog).toHaveBeenCalled();
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when player not found (P2025)', async () => {
      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Updated Name',
        nickname: 'updated',
      });
      prisma.player.update.mockRejectedValue({ code: 'P2025' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 409 on unique constraint violation (P2002)', async () => {
      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Updated Name',
        nickname: 'existing-test',
      });
      prisma.player.update.mockRejectedValue({ code: 'P2002' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', nickname: 'existing-test' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'A player with this nickname already exists',
        }),
        { status: 409 }
      );
    });
  });
});

describe('DELETE /api/players/[id]', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire logger mock after clearAllMocks
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
    // Set up admin auth by default for DELETE tests since all DELETE operations
    // require admin authentication. Individual tests can override this.
    auth.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      // Override the default admin auth with unauthenticated state
      auth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should delete player successfully (soft delete)', async () => {
      prisma.player.delete.mockResolvedValue({});
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
        headers: { 'user-agent': 'test-agent' },
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(prisma.player.delete).toHaveBeenCalledWith({
        where: { id: 'player-1' }
      });

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'DELETE_PLAYER',
          targetId: 'player-1',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Player deleted successfully (soft delete)",
          softDeleted: true,
        })
      );
    });

    it('should create audit log on successful deletion', async () => {
      prisma.player.delete.mockResolvedValue({});
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
        headers: { 'user-agent': 'test-agent' },
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(auditLogMock.createAuditLog).toHaveBeenCalled();
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when player not found (P2025)', async () => {
      prisma.player.delete.mockRejectedValue({ code: 'P2025' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 500 on database error', async () => {
      prisma.player.delete.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to delete player',
        }),
        { status: 500 }
      );
    });
  });
});
