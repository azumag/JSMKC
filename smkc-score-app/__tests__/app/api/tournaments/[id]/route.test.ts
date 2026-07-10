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
  createAuditLog: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    UPDATE_TOURNAMENT: 'UPDATE_TOURNAMENT',
    DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',
  },
  resolveAuditUserId: jest.fn((s) => s?.user?.id ?? undefined),
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
        publicModes: ['ta', 'bm', 'mr', 'gp'], // at least one mode = visible to non-admin
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

      // createSuccessResponse wraps the tournament in { success: true, data: ... }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
    });

    it('should return summary fields only when ?fields=summary is passed', async () => {
      const mockSummary = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
        status: 'active',
        publicModes: ['ta'], // at least one mode = visible to non-admin
        frozenStages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockSummary);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1?fields=summary'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // Verify the select does NOT include bmQualifications or bmMatches
      const callArgs = (prisma.tournament.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('bmQualifications');
      expect(callArgs.select).not.toHaveProperty('bmMatches');
      expect(callArgs.select).toHaveProperty('slug', true);
      expect(callArgs.select).toHaveProperty('name', true);
      expect(callArgs.select).toHaveProperty('status', true);
    });

    it('should retry transient summary read failures', async () => {
      const mockSummary = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
        status: 'active',
        publicModes: ['ta'],
        frozenStages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.tournament.findUnique as jest.Mock)
        .mockRejectedValueOnce(new Error('D1 transient read failure'))
        .mockResolvedValueOnce(mockSummary);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1?fields=summary'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.findUnique).toHaveBeenCalledTimes(2);
      expect(loggerInstance.warn).toHaveBeenCalledWith(
        'Retrying tournament read',
        expect.objectContaining({ attempt: 1, id: 't1' })
      );
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockSummary,
      });
    });

    it('should include BM relations when ?fields is not summary', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test',
        publicModes: ['bm'], // at least one mode = visible to non-admin
        bmQualifications: [],
        bmMatches: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const callArgs = (prisma.tournament.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).toHaveProperty('bmQualifications');
      expect(callArgs.select).toHaveProperty('bmMatches');
    });

    it('should resolve tournament slug before fetching details', async () => {
      const mockTournament = {
        id: 't1',
        slug: 'jsmkc2026',
        name: 'Test Tournament',
        publicModes: ['ta'], // at least one mode = visible to non-admin
        bmQualifications: [],
        bmMatches: [],
      };

      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/jsmkc2026'),
        { params: Promise.resolve({ id: 'jsmkc2026' }) }
      );

      expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }],
        },
        select: { id: true },
      });

      expect(prisma.tournament.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
        })
      );
    });
  });

  describe('Visibility', () => {
    it('should return 403 when tournament has no public modes and user is not admin', async () => {
      jest.mocked(auth).mockResolvedValue(null);
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
        id: 't1',
        name: 'Private Tournament',
        publicModes: [], // empty = no visible modes = private to non-admin
        bmQualifications: [],
        bmMatches: [],
      });

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'FORBIDDEN' }),
        { status: 403 }
      );
    });

    it('should return 200 when tournament has no public modes but user is admin', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      const mockTournament = {
        id: 't1',
        name: 'Private Tournament',
        publicModes: [], // empty = private, but admin bypasses visibility check
        bmQualifications: [],
        bmMatches: [],
      };
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await tournamentRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
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
          success: false,
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
          success: false,
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
      jest.mocked(auth).mockResolvedValue(null);

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
          error: 'Forbidden',
          code: 'FORBIDDEN',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      jest.mocked(auth).mockResolvedValue({
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
          error: 'Forbidden',
          code: 'FORBIDDEN',
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

      jest.mocked(auth).mockResolvedValue({
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

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
    });

    // Independent per-mode toggling (issue #618): any subset of valid mode
    // names is accepted, with no ordering or prefix constraint.
    it.each([
      [[]],
      [['ta']],
      [['bm']],
      [['mr']],
      [['gp']],
      [['overall']],
      [['ta', 'bm']],
      [['bm', 'gp']],
      [['ta', 'mr']],
      [['gp', 'overall']],
      [['ta', 'bm', 'mr', 'gp', 'overall']],
      // Order is irrelevant
      [['overall', 'gp', 'ta']],
    ])('should accept any valid publicModes subset %p', async (publicModes) => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ publicModes });
      (prisma.tournament.update as jest.Mock).mockResolvedValue({ id: 't1', publicModes });
      auditLogMock.createAuditLog.mockResolvedValue(undefined);

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ publicModes }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { publicModes } })
      );
    });

    it.each([
      // Unknown mode names
      [['foo']],
      [['ta', 'foo']],
      // Duplicates
      [['ta', 'ta']],
      [['bm', 'mr', 'bm']],
    ])('should reject invalid publicModes %p with 400', async (publicModes) => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ publicModes });

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ publicModes }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.update).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 }
      );
    });

    it('should update tournament status successfully (active -> completed)', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
        status: 'completed',
      };

      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        status: 'completed',
      });
      // Status transitions are validated atomically via a conditional
      // updateMany (issue #2761: closes the TOCTOU window a separate
      // findUnique-then-update would leave open) — a matched row means the
      // transition was legal, and the tournament is re-read afterward to
      // return the fresh record.
      (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ status: 'completed' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // The WHERE clause folds the transition-validity check into the write
      // itself: only rows currently in a status this target is reachable
      // from get updated, closing the race a separate read+write would leave.
      expect(prisma.tournament.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1', status: { in: expect.arrayContaining(['completed', 'active']) } },
          data: expect.objectContaining({ status: 'completed' }),
        })
      );
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
    });

    it('should reopen a completed tournament back to active (completed -> active)', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        status: 'active',
        publicModes: [],
      };

      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status: 'active' });
      (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ status: 'active' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 't1', status: 'completed' },
          data: expect.objectContaining({ status: 'active', publicModes: [] }),
        }
      );
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
    });

    it.each(['draft', 'active', 'completed'])(
      'should accept a same-status no-op update (%s -> %s)',
      async (status) => {
        const mockTournament = { id: 't1', status };

        jest.mocked(auth).mockResolvedValue({
          user: { id: 'admin-1', role: 'admin' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status });
        if (status === 'active') {
          (prisma.tournament.updateMany as jest.Mock)
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 });
        } else {
          (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        }
        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        auditLogMock.createAuditLog.mockResolvedValue(undefined);
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        await tournamentRoute.PUT(
          new NextRequest('http://localhost:3000/api/tournaments/t1', {
            method: 'PUT',
            body: JSON.stringify({ status }),
          }),
          { params: Promise.resolve({ id: 't1' }) }
        );

        expect(prisma.tournament.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status }) })
        );
        if (status === 'active') {
          expect((prisma.tournament.updateMany as jest.Mock).mock.calls[1][0].data)
            .not.toHaveProperty('publicModes');
        }
        expect(NextResponse.json).toHaveBeenCalledWith({
          success: true,
          data: mockTournament,
        });
      }
    );

    it.each([
      // Starting a tournament — the most common transition.
      ['draft', 'active'],
      // Demoting back to draft is the deletion path (issue #667): DELETE
      // only accepts draft tournaments, so cleanup tooling demotes first.
      ['active', 'draft'],
      ['completed', 'draft'],
    ])(
      'should accept the allowed status transition (%s -> %s)',
      async (current, next) => {
        const mockTournament = { id: 't1', status: next };

        jest.mocked(auth).mockResolvedValue({
          user: { id: 'admin-1', role: 'admin' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status: next });
        if (next === 'active') {
          (prisma.tournament.updateMany as jest.Mock)
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 });
        } else {
          (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
        }
        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        auditLogMock.createAuditLog.mockResolvedValue(undefined);
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');
        void current; // documents the scenario; the mock doesn't model per-row filtering

        await tournamentRoute.PUT(
          new NextRequest('http://localhost:3000/api/tournaments/t1', {
            method: 'PUT',
            body: JSON.stringify({ status: next }),
          }),
          { params: Promise.resolve({ id: 't1' }) }
        );

        expect(prisma.tournament.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: next }) })
        );
        if (next === 'active') {
          expect((prisma.tournament.updateMany as jest.Mock).mock.calls[1][0].data)
            .not.toHaveProperty('publicModes');
        }
        expect(NextResponse.json).toHaveBeenCalledWith({
          success: true,
          data: mockTournament,
        });
      }
    );

    it.each([
      // Skipping activation: a tournament must be started before completion.
      ['draft', 'completed'],
    ])(
      'should reject a disallowed status transition (%s -> %s) with 400',
      async (current, next) => {
        jest.mocked(auth).mockResolvedValue({
          user: { id: 'admin-1', role: 'admin' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status: next });
        // The conditional updateMany's WHERE clause excludes rows whose
        // current status isn't a valid source for `next`, so a disallowed
        // transition always reports as a 0-row match — exactly like a
        // concurrent request having raced the status out from under us.
        (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ status: current });

        await tournamentRoute.PUT(
          new NextRequest('http://localhost:3000/api/tournaments/t1', {
            method: 'PUT',
            body: JSON.stringify({ status: next }),
          }),
          { params: Promise.resolve({ id: 't1' }) }
        );

        expect(prisma.tournament.update).not.toHaveBeenCalled();
        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            code: 'VALIDATION_ERROR',
          }),
          { status: 400 }
        );
      }
    );

    it('should reject a status transition that raced away concurrently, without ever writing (issue #2761)', async () => {
      // Simulates: request read/validated against a stale "active" status,
      // but another admin's request already moved the row to "draft" before
      // this write landed. The atomic conditional updateMany must observe
      // the CURRENT row status, not any status this request assumed.
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status: 'completed' });
      (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ status: 'draft' });

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ status: 'completed' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.update).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Cannot change tournament status from "draft" to "completed"',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 }
      );
    });

    it.each([
      // Plain unknown value.
      ['archived'],
      // Prototype key: `status in ALLOWED_STATUS_TRANSITIONS` would let this
      // through — the route must use Object.hasOwn for value validation.
      ['toString'],
    ])('should reject an unknown status value (%p) with 400 before reading the database', async (status) => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status });

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ status }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      // Value validation must short-circuit: no database access at all.
      expect(prisma.tournament.findUnique).not.toHaveBeenCalled();
      expect(prisma.tournament.updateMany).not.toHaveBeenCalled();
      expect(prisma.tournament.update).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 }
      );
    });

    it('should return 404 when changing status of a tournament that does not exist', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ status: 'active' });
      (prisma.tournament.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ status: 'active' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.update).not.toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Tournament not found',
        }),
        { status: 404 }
      );
    });

    it('should enable debugMode on an existing tournament (#746)', async () => {
      const mockTournament = { id: 't1', debugMode: true };

      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ debugMode: true });
      (prisma.tournament.update as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1', {
          method: 'PUT',
          body: JSON.stringify({ debugMode: true }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { debugMode: true } })
      );
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
    });
  });

  describe('Error Cases', () => {
    it('should handle audit log failures gracefully', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
      };

      jest.mocked(auth).mockResolvedValue({
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
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTournament,
      });
    });

    it('should return 404 when tournament not found (P2025)', async () => {
      const prismaError = new Error('Record not found') as Error & { code?: string };
      prismaError.code = 'P2025';

      jest.mocked(auth).mockResolvedValue({
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
          success: false,
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
      jest.mocked(auth).mockResolvedValue(null);

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Forbidden',
          code: 'FORBIDDEN',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when authenticated user is not admin', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Forbidden',
          code: 'FORBIDDEN',
        }),
        { status: 403 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should delete tournament successfully', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1', {
        headers: { 'user-agent': 'test-agent' },
      });

      await tournamentRoute.DELETE(request, { params: Promise.resolve({ id: 't1' }) });

      expect(prisma.tournament.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1', status: 'draft' },
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

      // createSuccessResponse wraps the message in { success: true, data: { message: ... } }
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Tournament deleted successfully',
        },
      });
    });
  });

  describe('Error Cases', () => {
    it.each(['active', 'completed'])(
      'should return 409 when tournament status is %s',
      async (status) => {
        jest.mocked(auth).mockResolvedValue({
          user: { id: 'admin-1', role: 'admin' },
        });
        (prisma.tournament.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ status });

        await tournamentRoute.DELETE(
          new NextRequest('http://localhost:3000/api/tournaments/t1'),
          { params: Promise.resolve({ id: 't1' }) }
        );

        expect(prisma.tournament.deleteMany).toHaveBeenCalledWith({
          where: { id: 't1', status: 'draft' },
        });
        expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
          where: { id: 't1' },
          select: { status: true },
        });
        expect(auditLogMock.createAuditLog).not.toHaveBeenCalled();
        expect(NextResponse.json).toHaveBeenCalledWith(
          {
            success: false,
            error: 'Started tournaments cannot be deleted',
            code: 'CONFLICT',
          },
          { status: 409 }
        );
      }
    );

    it('should handle audit log failures gracefully', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
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
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Tournament deleted successfully',
        },
      });
    });

    it('should return 404 when tournament not found', async () => {
      jest.mocked(auth).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      await tournamentRoute.DELETE(
        new NextRequest('http://localhost:3000/api/tournaments/t1'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Tournament not found',
        }),
        { status: 404 }
      );
    });
  });
});
