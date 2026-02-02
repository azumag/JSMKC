/**
 * @module Tournament [id] Route Tests
 *
 * Test suite for the /api/tournaments/[id] endpoint covering GET, PUT, and DELETE methods.
 *
 * GET /api/tournaments/[id]:
 * - Returns tournament details including related BM qualifications and matches
 * - Returns 404 when tournament not found
 * - Handles database errors with 500 status and structured logging
 *
 * PUT /api/tournaments/[id]:
 * - Updates tournament fields (name, status, etc.)
 * - Requires admin authentication (returns 403 for non-admin/unauthenticated)
 * - Creates audit log entries on successful updates
 * - Handles audit log failures gracefully (tournament still updated)
 * - Handles not found (P2025) with 404
 *
 * DELETE /api/tournaments/[id]:
 * - Deletes the tournament record
 * - Requires admin authentication (returns 403 for non-admin/unauthenticated)
 * - Creates audit log entries on successful deletion
 * - Handles audit log failures gracefully (tournament still deleted)
 * - Handles not found (P2025) with 404
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes
// NOTE: Do NOT import from @jest/globals. Mock factories run with the global jest,
// so using the imported jest causes mock identity mismatches (see mock-debug2.test.ts).
import { NextRequest } from 'next/server';

// Mock dependencies


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

// Logger mock returns a shared instance so tests can verify calls on the same object
jest.mock('@/lib/logger', () => {
  const mockLoggerInstance = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => mockLoggerInstance),
  };
});

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
// Pre-capture the logger instance for assertions.
// After clearAllMocks(), createLogger loses its return value, so we re-set it in beforeEach.
const loggerInstance = loggerMock.createLogger('initial');

describe('GET /api/tournaments/[id]', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure mocks that clearAllMocks() reset:
    // - createLogger must return the shared logger instance for assertion verification
    // - getServerSideIdentifier must resolve for audit log creation
    // - sanitizeInput must pass through data (default behavior)
    (loggerMock.createLogger as jest.Mock).mockReturnValue(loggerInstance);
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
    sanitizeMock.sanitizeInput.mockImplementation((data: unknown) => data);
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

      // Verify the pre-captured logger instance logged the error.
      // loggerInstance is the same object returned by createLogger inside the source.
      expect(loggerInstance.error).toHaveBeenCalledWith(
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
    // Re-configure mocks after clearAllMocks resets return values
    (loggerMock.createLogger as jest.Mock).mockReturnValue(loggerInstance);
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
    sanitizeMock.sanitizeInput.mockImplementation((data: unknown) => data);
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

      // Verify the pre-captured logger instance logged the warning
      expect(loggerInstance.warn).toHaveBeenCalledWith(
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
    // Re-configure mocks after clearAllMocks resets return values
    (loggerMock.createLogger as jest.Mock).mockReturnValue(loggerInstance);
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
    sanitizeMock.sanitizeInput.mockImplementation((data: unknown) => data);
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
    it('should delete tournament successfully', async () => {
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
          }),
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Tournament deleted successfully',
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

      // Verify the pre-captured logger instance logged the warning
      expect(loggerInstance.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Should still return success even if audit log fails
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Tournament deleted successfully',
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
