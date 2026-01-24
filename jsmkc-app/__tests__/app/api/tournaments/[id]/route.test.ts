// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    UPDATE_TOURNAMENT: 'UPDATE_TOURNAMENT',
    DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',
  },
}));

jest.mock('@/lib/rate-limit', () => ({
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

jest.mock('@/lib/logger');

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
import * as tournamentRoute from '@/app/api/tournaments/[id]/route';

const auditLogMock = jest.requireMock('@/lib/audit-log') as {
  createAuditLog: jest.Mock;
  AUDIT_ACTIONS: typeof import('@/lib/audit-log').AUDIT_ACTIONS;
};

const sanitizeMock = jest.requireMock('@/lib/sanitize') as {
  sanitizeInput: jest.Mock;
};

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getServerSideIdentifier: jest.Mock;
};

const loggerMock = jest.requireMock('@/lib/logger') as {
  createLogger: jest.Mock;
};

describe('GET /api/tournaments/[id]', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return tournament details when tournament exists', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
        status: 'active',
        token: 'test-token',
        tokenExpiresAt: new Date('2024-02-01'),
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        bmQualifications: [],
        bmMatches: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Tournament not found',
        }),
        { status: 404 }
      );
    });

    it('should handle database errors gracefully', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const logger = loggerMock.createLogger('tournament-id-test');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch tournament',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch tournament',
        }),
        { status: 500 }
      );
    });
  });
});

describe('PUT /api/tournaments/[id]', () => {
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

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Tournament' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Tournament' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should update tournament name successfully', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Updated Tournament',
        date: new Date('2024-01-01'),
        status: 'active',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Updated Tournament',
      });
      (prisma.tournament.update as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1', {
        method: 'PUT',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({ name: 'Updated Tournament' }),
      });

      await tournamentRoute.PUT(request, { params: Promise.resolve({ id: 't1' }) });

      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: { name: 'Updated Tournament' },
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'UPDATE_TOURNAMENT',
          targetId: 't1',
          targetType: 'Tournament',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament);
    });

    it('should update tournament status successfully', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
        status: 'completed',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        status: 'completed',
      });
      (prisma.tournament.update as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ status: 'completed' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament);
    });
  });

  describe('Error Cases', () => {
    it('should handle audit log failures gracefully', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ name: 'Test Tournament' });
      (prisma.tournament.update as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log error'));
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ name: 'Test Tournament' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const logger = loggerMock.createLogger('tournament-id-test');
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Should still return tournament even if audit log fails
      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament);
    });

    it('should return 404 when tournament not found (P2025)', async () => {
      const prismaError = new Error('Record not found') as Error & { code?: string };
      prismaError.code = 'P2025';

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ name: 'Test Tournament' });
      (prisma.tournament.update as jest.Mock).mockRejectedValue(prismaError);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ name: 'Test Tournament' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Tournament not found',
        }),
        { status: 404 }
      );
    });
  });
});

describe('DELETE /api/tournaments/[id]', () => {
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

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should soft delete tournament successfully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.delete as jest.Mock).mockResolvedValue(undefined);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1', {
        headers: { 'user-agent': 'test-agent' },
      });

      await tournamentRoute.DELETE(request, { params: Promise.resolve({ id: 't1' }) });

      expect(prisma.tournament.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'DELETE_TOURNAMENT',
          targetId: 't1',
          targetType: 'Tournament',
          details: expect.objectContaining({
            tournamentId: 't1',
            softDeleted: true,
          }),
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Tournament deleted successfully (soft delete)',
          softDeleted: true,
        })
      );
    });
  });

  describe('Error Cases', () => {
    it('should handle audit log failures gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.delete as jest.Mock).mockResolvedValue(undefined);
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log error'));
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const logger = loggerMock.createLogger('tournament-id-test');
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Should still return success even if audit log fails
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Tournament deleted successfully (soft delete)',
          softDeleted: true,
        })
      );
    });

    it('should return 404 when tournament not found (P2025)', async () => {
      const prismaError = new Error('Record not found') as Error & { code?: string };
      prismaError.code = 'P2025';

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.delete as jest.Mock).mockRejectedValue(prismaError);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Tournament not found',
        }),
        { status: 404 }
      );
    });
  });
});
