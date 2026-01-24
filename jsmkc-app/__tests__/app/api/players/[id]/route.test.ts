import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

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

const auditLogMock = jest.requireMock('@/lib/audit-log') as {
  createAuditLog: jest.Mock;
  AUDIT_ACTIONS: typeof import('@/lib/audit-log').AUDIT_ACTIONS;
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

type PrismaError = {
  code: string;
};

describe('GET /api/players/[id]', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
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

      (prisma.player.findUnique as jest.Mock).mockResolvedValue(mockPlayer);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'GET',
      });

      const route = (await import('@/app/api/players/[id]/route')).GET;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-1' }
      });
      expect(NextResponse.json).toHaveBeenCalledWith(mockPlayer);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when player not found', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'GET',
      });

      const route = (await import('@/app/api/players/[id]/route')).GET;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 500 on database error', async () => {
      (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'GET',
      });

      const route = (await import('@/app/api/players/[id]/route')).GET;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ nickname: 'updated' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ name: 'Updated Name' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Updated Name',
        nickname: 'updated',
        country: 'US',
      });
      (prisma.player.update as jest.Mock).mockResolvedValue(mockPlayer);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

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
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Updated Name',
        nickname: 'updated',
      });
      (prisma.player.update as jest.Mock).mockResolvedValue({
        id: 'player-1',
      });
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Updated Name',
        nickname: 'updated',
      });
      (prisma.player.update as jest.Mock).mockRejectedValue(
        { code: 'P2025' } as PrismaError
      );

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', nickname: 'updated' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 409 on unique constraint violation (P2002)', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Updated Name',
        nickname: 'existing-test',
      });
      (prisma.player.update as jest.Mock).mockRejectedValue(
        { code: 'P2002' } as PrismaError
      );

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', nickname: 'existing-test' }),
      });

      const route = (await import('@/app/api/players/[id]/route')).PUT;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.delete as jest.Mock).mockResolvedValue({});
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
        headers: { 'user-agent': 'test-agent' },
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.delete as jest.Mock).mockResolvedValue({});
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

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
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.delete as jest.Mock).mockRejectedValue(
        { code: 'P2025' } as PrismaError
      );

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 500 on database error', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.delete as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players/player-1', {
        method: 'DELETE',
      });

      const route = (await import('@/app/api/players/[id]/route')).DELETE;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to delete player',
        }),
        { status: 500 }
      );
    });
  });
});
