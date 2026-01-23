// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

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
    CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
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
import { sanitizeInput } from '@/lib/sanitize';
import { paginate } from '@/lib/pagination';
import { createAuditLog } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import * as tournamentsRoute from '@/app/api/tournaments/route';

const logger = createLogger('tournaments-route-test');

describe('GET /api/tournaments', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return tournaments with pagination', async () => {
      const mockTournaments = [
        { id: 't1', name: 'Tournament 1', date: '2024-01-01' },
        { id: 't2', name: 'Tournament 2', date: '2024-01-02' },
      ];

      (prisma.tournament.findMany as jest.Mock).mockResolvedValue(mockTournaments);
      (prisma.tournament.count as jest.Mock).mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/tournaments?page=1&limit=10', {
        method: 'GET',
      });

      const response = await tournamentsRoute.GET(request);

      expect(paginate).toHaveBeenCalledWith(
        {
          findMany: prisma.tournament.findMany,
          count: prisma.tournament.count,
        },
        { deletedAt: null },
        { date: 'desc' },
        { page: 1, limit: 10 }
      );

      expect(NextResponse.json).toHaveBeenCalledWith({
        items: mockTournaments,
        page: 1,
        limit: 10,
        total: 2,
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

      const response = await tournamentsRoute.GET(request);

      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        { deletedAt: null },
        expect.any(Object),
        { page: 1, limit: 50 }
      );
    });
  });

  describe('Error Cases', () => {
    it('should return 500 on database error', async () => {
      (prisma.tournament.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'GET',
      });

      const response = await tournamentsRoute.GET(request);

      expect(logger.error).toHaveBeenCalledWith(
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

      const response = await tournamentsRoute.POST(request);

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

      const response = await tournamentsRoute.POST(request);

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
      (sanitizeInput as jest.Mock).mockReturnValue({ date: '2024-01-01' });

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ date: '2024-01-01' }),
      });

      const response = await tournamentsRoute.POST(request);

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
      (sanitizeInput as jest.Mock).mockReturnValue({ name: 'Test Tournament' });

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Tournament' }),
      });

      const response = await tournamentsRoute.POST(request);

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
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      const response = await tournamentsRoute.POST(request);

      expect(prisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Test Tournament',
            date: expect.any(Date),
            status: 'draft',
          },
        })
      );

      expect(createAuditLog).toHaveBeenCalledWith(
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
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      await tournamentsRoute.POST(request);

      expect(createAuditLog).toHaveBeenCalled();
    });

    it('should handle audit log failures gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Tournament',
        date: '2024-01-01',
      });
      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log error'));
      (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Tournament',
          date: '2024-01-01',
        }),
      });

      const response = await tournamentsRoute.POST(request);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockTournament, { status: 201 });
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeInput as jest.Mock).mockReturnValue({
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

      const response = await tournamentsRoute.POST(request);

      expect(logger.error).toHaveBeenCalledWith(
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
