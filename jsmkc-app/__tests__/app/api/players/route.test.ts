/**
 * @module Players Route Tests
 *
 * Test suite for the /api/players endpoint covering both GET and POST methods.
 *
 * GET /api/players:
 * - Returns a paginated list of players sorted by nickname
 * - Supports custom page and limit query parameters (defaults: page=1, limit=50)
 * - Returns all active players
 * - Handles database errors gracefully with 500 status
 *
 * POST /api/players:
 * - Creates a new player with auto-generated secure password
 * - Requires admin authentication (returns 403 for non-admin/unauthenticated)
 * - Validates required fields (name, nickname) with 400 status
 * - Handles unique constraint violations (P2002) with 409 status
 * - Creates audit log entries on successful creation
 * - Sanitizes input data before processing
 *
 * Note: The jest.mock for @/lib/pagination is intentionally omitted here.
 * Due to ESM binding issues, the route module always receives the real paginate
 * function (not the mock). Instead, we mock the underlying Prisma methods
 * (prisma.player.findMany, prisma.player.count) which the real paginate calls.
 * The response format from real paginate is { data, meta: { total, page, limit, totalPages } }.
 *
 * IMPORTANT: This test file uses @ts-nocheck and global jest (not @jest/globals).
 * jest.mock factory functions run in the global jest context due to hoisting.
 * Using jest from @jest/globals inside test bodies while factories use global jest
 * can cause mock identity mismatches. Using global jest throughout avoids this issue.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

// Mock dependencies - using same pattern as working tournament tests

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

// Logger mock: shared mockLoggerInstance is created in the factory and
// returned by createLogger on every call. After clearAllMocks, the factory
// implementation is preserved (clearAllMocks only clears calls/instances).
const mockLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => mockLoggerInstance),
}));

jest.mock('@/lib/password-utils', () => ({
  generateSecurePassword: jest.fn(() => 'generated-password'),
  hashPassword: jest.fn(() => Promise.resolve('hashed-password')),
  verifyPassword: jest.fn(),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    CREATE_PLAYER: 'CREATE_PLAYER',
  },
}));

jest.mock('@/lib/rate-limit', () => ({
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

// Custom next/server mock with proper NextRequest implementation.
// The global jest.setup.js also mocks next/server, but this local mock
// overrides it for this test file to ensure consistent behavior.
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
import * as playerRoute from '@/app/api/players/route';

const auditLogMock = jest.requireMock('@/lib/audit-log');
const passwordUtilsMock = jest.requireMock('@/lib/password-utils');
const sanitizeMock = jest.requireMock('@/lib/sanitize');
const rateLimitMock = jest.requireMock('@/lib/rate-limit');
const loggerMock = jest.requireMock('@/lib/logger');

describe('GET /api/players', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire createLogger to return the shared logger instance after clearAllMocks.
    // clearAllMocks only clears calls/instances, but the factory implementation
    // in jest.fn(() => mockLoggerInstance) should persist. However, to be safe
    // and explicit, we re-set it here.
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return paginated list of players with default pagination', async () => {
      // Mock data: two players returned by findMany, count returns 2
      const mockPlayers = [
        { id: 'p1', name: 'Player 1', nickname: 'player1' },
        { id: 'p2', name: 'Player 2', nickname: 'player2' },
      ];

      // The real paginate function calls prisma.player.count and prisma.player.findMany
      // in parallel via Promise.all. We mock these underlying Prisma methods.
      prisma.player.findMany.mockResolvedValue(mockPlayers);
      prisma.player.count.mockResolvedValue(2);

      const req = new NextRequest('http://localhost:3000/api/players');
      await playerRoute.GET(req);

      // Verify the Prisma calls were made with correct parameters
      // paginate calls count({ where: {} })
      expect(prisma.player.count).toHaveBeenCalledWith({
        where: {},
      });

      // paginate calls findMany with where, orderBy, skip, take
      expect(prisma.player.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { nickname: 'asc' },
        skip: 0,
        take: 50,
      });

      // Real paginate returns { data, meta: { total, page, limit, totalPages } }
      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockPlayers,
        meta: {
          total: 2,
          page: 1,
          limit: 50,
          totalPages: 1,
        },
      });
    });

    it('should return paginated list with custom page and limit', async () => {
      const mockPlayers = [{ id: 'p1', name: 'Player 1', nickname: 'player1' }];

      prisma.player.findMany.mockResolvedValue(mockPlayers);
      prisma.player.count.mockResolvedValue(25);

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players?page=2&limit=10')
      );

      // With page=2, limit=10, skip should be (2-1)*10 = 10
      expect(prisma.player.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { nickname: 'asc' },
        skip: 10,
        take: 10,
      });

      // Real paginate: totalPages = Math.ceil(25/10) = 3
      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockPlayers,
        meta: {
          total: 25,
          page: 2,
          limit: 10,
          totalPages: 3,
        },
      });
    });

    it('should return all players without filtering', async () => {
      const mockPlayers = [{ id: 'p1', name: 'Active Player', nickname: 'active' }];

      prisma.player.findMany.mockResolvedValue(mockPlayers);
      prisma.player.count.mockResolvedValue(1);

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      // Verify that an empty where clause is passed (no filters)
      expect(prisma.player.count).toHaveBeenCalledWith({
        where: {},
      });

      expect(prisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockPlayers,
        meta: {
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        },
      });
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      // Make the underlying prisma calls fail so real paginate throws
      prisma.player.findMany.mockRejectedValue(new Error('Database error'));
      prisma.player.count.mockRejectedValue(new Error('Database error'));

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      // After the route runs, the logger instance (shared mockLoggerInstance)
      // should have received the error call from the route's catch block.
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        'Failed to fetch players',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to fetch players' },
        { status: 500 }
      );
    });
  });
});

describe('POST /api/players', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire mocks after clearAllMocks clears mock implementations.
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
    // Re-set password-utils mock implementations to ensure the mocked
    // values are returned instead of undefined (bare jest.fn() after clear).
    passwordUtilsMock.generateSecurePassword.mockReturnValue('generated-password');
    passwordUtilsMock.hashPassword.mockResolvedValue('hashed-password');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      auth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'test' }),
      });

      await playerRoute.POST(request);
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      auth.mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          role: 'user',
        },
      });

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'test' }),
      });

      await playerRoute.POST(request);
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
      auth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      sanitizeMock.sanitizeInput.mockReturnValue({ nickname: 'test' });

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ nickname: 'test' }),
      });

      await playerRoute.POST(request);
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });

    it('should return 400 when nickname is missing', async () => {
      auth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      sanitizeMock.sanitizeInput.mockReturnValue({ name: 'Test Player' });

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player' }),
      });

      await playerRoute.POST(request);
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });
  });

  describe('Successful Player Creation', () => {
    const mockPlayer = {
      id: 'player-1',
      name: 'Test Player',
      nickname: 'test',
      country: 'JP',
      password: 'hashed-password',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create player successfully with valid data', async () => {
      auth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
        country: 'JP',
      });
      prisma.player.create.mockResolvedValue(mockPlayer);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Test Player',
          nickname: 'test',
          country: 'JP',
        }),
      });

      await playerRoute.POST(request);

      expect(prisma.player.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Player',
            nickname: 'test',
            country: 'JP',
            password: 'hashed-password',
          }),
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: auditLogMock.AUDIT_ACTIONS.CREATE_PLAYER,
          targetId: 'player-1',
          targetType: 'Player',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          player: mockPlayer,
          temporaryPassword: 'generated-password',
        },
        { status: 201 }
      );
    });

    it('should log error when player creation fails in database', async () => {
      // This test verifies that logger.error is called when prisma.player.create throws
      auth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
      });
      prisma.player.create.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'test' }),
      });

      await playerRoute.POST(request);

      // Verify the shared logger instance received the error call
      // from the route's catch block
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        'Failed to create player',
        expect.any(Object)
      );
    });

    it('should handle unique constraint violation (P2002) with 409 status', async () => {
      auth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      sanitizeMock.sanitizeInput.mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
      });
      const prismaError = new Error('Unique constraint failed');
      prismaError.code = 'P2002';
      prisma.player.create.mockRejectedValue(prismaError);

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'existing-test' }),
      });

      await playerRoute.POST(request);

      // Logger should still be called with the error
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        'Failed to create player',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'A player with this nickname already exists' },
        { status: 409 }
      );
    });
  });
});
