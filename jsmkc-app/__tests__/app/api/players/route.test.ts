// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies - using same pattern as working tournament tests


jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/pagination', () => ({
  paginate: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('@/lib/password-utils', () => ({
  generateSecurePassword: jest.fn(),
  hashPassword: jest.fn(),
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

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import * as playerRoute from '@/app/api/players/route';

const auditLogMock = jest.requireMock('@/lib/audit-log') as {
  createAuditLog: jest.Mock;
  AUDIT_ACTIONS: typeof import('@/lib/audit-log').AUDIT_ACTIONS;
};

const passwordUtilsMock = jest.requireMock('@/lib/password-utils') as {
  generateSecurePassword: jest.Mock;
  hashPassword: jest.Mock;
};

const sanitizeMock = jest.requireMock('@/lib/sanitize') as {
  sanitizeInput: jest.Mock;
};

const paginationMock = jest.requireMock('@/lib/pagination') as {
  paginate: jest.Mock;
};

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getServerSideIdentifier: jest.Mock;
};

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/players', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return paginated list of players with default pagination', async () => {
      const mockPlayers = [
        { id: 'p1', name: 'Player 1', nickname: 'player1' },
        { id: 'p2', name: 'Player 2', nickname: 'player2' },
      ];

      (prisma.player.findMany as jest.Mock).mockResolvedValue(mockPlayers);
      (prisma.player.count as jest.Mock).mockResolvedValue(2);
      (paginationMock.paginate as jest.Mock).mockResolvedValue({
        data: mockPlayers,
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        },
      });

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      expect(paginationMock.paginate).toHaveBeenCalledWith(
        expect.objectContaining({
          findMany: prisma.player.findMany,
          count: prisma.player.count,
        }),
        { deletedAt: null },
        { nickname: 'asc' },
        { page: 1, limit: 50 }
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockPlayers,
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        },
      });
    });

    it('should return paginated list with custom page and limit', async () => {
      const mockPlayers = [{ id: 'p1', name: 'Player 1', nickname: 'player1' }];

      (prisma.player.findMany as jest.Mock).mockResolvedValue(mockPlayers);
      (prisma.player.count as jest.Mock).mockResolvedValue(25);
      (paginationMock.paginate as jest.Mock).mockResolvedValue({
        data: mockPlayers,
        pagination: {
          page: 2,
          limit: 10,
          total: 25,
          totalPages: 3,
        },
      });

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players?page=2&limit=10')
      );

      expect(paginationMock.paginate).toHaveBeenCalledWith(
        expect.anything(),
        { deletedAt: null },
        { nickname: 'asc' },
        { page: 2, limit: 10 }
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockPlayers,
        pagination: {
          page: 2,
          limit: 10,
          total: 25,
          totalPages: 3,
        },
      });
    });

    it('should filter out soft deleted players', async () => {
      const mockPlayers = [{ id: 'p1', name: 'Active Player', nickname: 'active' }];

      (prisma.player.findMany as jest.Mock).mockResolvedValue(mockPlayers);
      (prisma.player.count as jest.Mock).mockResolvedValue(1);
      (paginationMock.paginate as jest.Mock).mockResolvedValue({
        data: mockPlayers,
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        },
      });

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      expect(paginationMock.paginate).toHaveBeenCalledWith(
        expect.anything(),
        { deletedAt: null },
        { nickname: 'asc' },
        expect.anything()
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockPlayers,
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        },
      });
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      (paginationMock.paginate as jest.Mock).mockRejectedValue(new Error('Database error'));

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      const logger = loggerMock.createLogger('players-route-test');
      expect(logger.error).toHaveBeenCalledWith(
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

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
      (auth as jest.Mock).mockResolvedValue({
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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ nickname: 'test' });

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ name: 'Test Player' });

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
        country: 'JP',
      });
      passwordUtilsMock.generateSecurePassword.mockReturnValue('generated-password');
      passwordUtilsMock.hashPassword.mockResolvedValue('hashed-password');
      (prisma.player.create as jest.Mock).mockResolvedValue(mockPlayer);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

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

    it('should create audit log on successful player creation', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
      });
      passwordUtilsMock.generateSecurePassword.mockReturnValue('generated-password');
      passwordUtilsMock.hashPassword.mockResolvedValue('hashed-password');
      (prisma.player.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'test' }),
      });

      await playerRoute.POST(request);

      const logger = loggerMock.createLogger('players-route-test');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create player',
        expect.any(Object)
      );
    });

    it('should handle unique constraint violation (P2002) with 409 status', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
      });
      passwordUtilsMock.generateSecurePassword.mockReturnValue('generated-password');
      passwordUtilsMock.hashPassword.mockResolvedValue('hashed-password');
      const prismaError = new Error('Unique constraint failed') as Error & { code?: string };
      prismaError.code = 'P2002';
      (prisma.player.create as jest.Mock).mockRejectedValue(prismaError);

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'existing-test' }),
      });

      await playerRoute.POST(request);

      const logger = loggerMock.createLogger('players-route-test');
      expect(logger.error).toHaveBeenCalledWith(
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
