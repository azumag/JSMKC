/**
 * @module Tournaments Route Tests
 *
 * Test suite for the /api/tournaments endpoint covering both GET and POST methods.
 *
 * GET /api/tournaments:
 * - Returns a paginated list of tournaments sorted by date (descending)
 * - Supports custom page and limit query parameters (defaults: page=1, limit=50)
 * - Returns all tournaments
 * - Uses real paginate() function which calls prisma.tournament.findMany/count
 * - Returns { data, meta: { total, page, limit, totalPages } }
 * - Handles database errors gracefully with 500 status
 *
 * POST /api/tournaments:
 * - Creates a new tournament with draft status
 * - Requires admin authentication (returns 403 for non-admin/unauthenticated)
 * - Validates required fields (name, date) with 400 status
 * - Creates audit log entries on successful creation
 * - Handles audit log failures gracefully (tournament still created)
 * - Sanitizes input data before processing
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes
// NOTE: Do NOT import from @jest/globals. Mock factories run with the global jest,
// so using the imported jest causes mock identity mismatches (see mock-debug2.test.ts).
import { NextRequest } from 'next/server';

// Mock dependencies - NOTE: pagination is NOT mocked; the real paginate()
// function runs and calls prisma.tournament.findMany/count which are mocked via jest.setup.js
//
// IMPORTANT: Most modules (auth, sanitize, logger, audit-log, rate-limit) have manual mock
// files in __mocks__/lib/. Those manual mocks are used by the source code, NOT the factory
// mocks defined here. We only need jest.mock() for modules where we want to override the
// __mocks__ behavior or for modules without __mocks__ files.
// We use jest.requireMock() to access and configure the manual mock functions.

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data: unknown) => data),
}));

jest.mock('@/lib/logger', () => {
  const mockLoggerInstance = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    __esModule: true,
    createLogger: jest.fn(() => mockLoggerInstance),
  };
});

jest.mock('@/lib/audit-log', () => ({
  __esModule: true,
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
  },
}));

jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import * as tournamentsRoute from '@/app/api/tournaments/route';

// Access mocks via jest.requireMock() to get the same module references the source uses.
const auditLogMock = jest.requireMock('@/lib/audit-log');
const sanitizeMock = jest.requireMock('@/lib/sanitize');
const rateLimitMock = jest.requireMock('@/lib/rate-limit');
const loggerMock = jest.requireMock('@/lib/logger');
// Pre-capture the logger instance returned by the mock factory for assertions.
// After clearAllMocks(), createLogger loses its return value, so we re-set it in beforeEach.
const loggerInstance = loggerMock.createLogger('initial');

describe('GET /api/tournaments', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure manual mock functions after clearAllMocks resets them:
    // - createLogger must return the shared logger instance for assertion verification
    // - getServerSideIdentifier must resolve for audit log creation
    // - sanitizeInput must pass through data (default behavior)
    (loggerMock.createLogger as jest.Mock).mockReturnValue(loggerInstance);
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
    sanitizeMock.sanitizeInput.mockImplementation((data: unknown) => data);

  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return tournaments with pagination', async () => {
      // Mock data: two tournaments that paginate() will return via findMany
      const mockTournaments = [
        { id: 't1', name: 'Tournament 1', date: '2024-01-01' },
        { id: 't2', name: 'Tournament 2', date: '2024-01-02' },
      ];

      // The real paginate() calls prisma.tournament.findMany and count in parallel
      (prisma.tournament.findMany as jest.Mock).mockResolvedValue(mockTournaments);
      (prisma.tournament.count as jest.Mock).mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/tournaments?page=1&limit=10', {
        method: 'GET',
      });

      await tournamentsRoute.GET(request);

      // Verify prisma.tournament.findMany was called with pagination parameters
      expect(prisma.tournament.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { date: 'desc' },
        skip: 0,
        take: 10,
      });

      // Verify prisma.tournament.count was called with the same where clause
      expect(prisma.tournament.count).toHaveBeenCalledWith({
        where: {},
      });

      // The real paginate() returns { data, meta: { total, page, limit, totalPages } }
      expect(NextResponse.json).toHaveBeenCalledWith({
        data: mockTournaments,
        meta: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('should use default pagination when no params', async () => {
      const mockTournaments = [
        { id: 't1', name: 'Tournament 1', date: '2024-01-01' },
      ];

      (prisma.tournament.findMany as jest.Mock).mockResolvedValue(mockTournaments);
      (prisma.tournament.count as jest.Mock).mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'GET',
      });

      await tournamentsRoute.GET(request);

      // Default pagination: page=1, limit=50
      expect(prisma.tournament.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { date: 'desc' },
        skip: 0,
        take: 50,
      });
    });
  });

  describe('Error Cases', () => {
    it('should return 500 on database error', async () => {
      // When findMany rejects, paginate() will throw and the route catches it
      (prisma.tournament.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      (prisma.tournament.count as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'GET',
      });

      await tournamentsRoute.GET(request);

      // Verify the shared logger instance logged the error
      const loggerInstance = loggerMock.createLogger('test');
      expect(loggerInstance.error).toHaveBeenCalledWith(
        'Failed to fetch tournaments',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch tournaments',
        }),
        { status: 500 }
      );
    });
  });
});

describe('POST /api/tournaments', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure manual mock functions after clearAllMocks resets them
    (loggerMock.createLogger as jest.Mock).mockReturnValue(loggerInstance);
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');
    sanitizeMock.sanitizeInput.mockImplementation((data: unknown) => data);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 403 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Tournament', date: '2024-01-01' }),
      });

      await tournamentsRoute.POST(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Admin access required',
        }),
        { status: 403 }
      );
    });

    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
      });

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Tournament', date: '2024-01-01' }),
      });

      await tournamentsRoute.POST(request);

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
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ date: '2024-01-01' });

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ date: '2024-01-01' }),
      });

      await tournamentsRoute.POST(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });

    it('should return 400 when date is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ name: 'Test Tournament' });

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Tournament' }),
      });

      await tournamentsRoute.POST(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });
  });

  describe('Success Cases', () => {
    const mockTournament = {
      id: 't1',
      name: 'Test Tournament',
      date: '2024-01-01',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create tournament successfully with valid data', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      await tournamentsRoute.POST(request);

      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Test Tournament',
            date: expect.any(Date),
            status: 'draft',
          },
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'CREATE_TOURNAMENT',
          targetId: 't1',
          targetType: 'Tournament',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament, { status: 201 });
    });

    it('should create audit log on successful tournament creation', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      await tournamentsRoute.POST(request);

      expect(auditLogMock.createAuditLog).toHaveBeenCalled();
    });

    it('should handle audit log failures gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);
      // Audit log fails but tournament creation should still succeed
      auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log error'));
      rateLimitMock.getServerSideIdentifier.mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      await tournamentsRoute.POST(request);

      // The shared logger singleton should have logged the warning
      const loggerInstance = loggerMock.createLogger('test');
      expect(loggerInstance.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Tournament should still be returned successfully despite audit log failure
      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament, { status: 201 });
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      await tournamentsRoute.POST(request);

      // The shared logger singleton should have logged the error
      const loggerInstance = loggerMock.createLogger('test');
      expect(loggerInstance.error).toHaveBeenCalledWith(
        'Failed to create tournament',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to create tournament',
        }),
        { status: 500 }
      );
    });
  });
});
