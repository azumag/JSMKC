import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/token-utils', () => ({
  generateTournamentToken: jest.fn(() => 'new-generated-token'),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTokenExpiry: jest.fn((hours) => new Date('2024-02-01T12:00:00.000Z')),
}));

jest.mock('@/lib/token-validation', () => ({
  validateTournamentToken: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
  })),
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

type PrismaError = {
  code: string;
};

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getServerSideIdentifier: jest.Mock;
};

const sanitizeMock = jest.requireMock('@/lib/sanitize') as {
  sanitizeInput: jest.Mock;
};

const tokenUtilsMock = jest.requireMock('@/lib/token-utils') as {
  generateTournamentToken: jest.Mock;
  getTokenExpiry: jest.Mock;
  extendTokenExpiry: jest.Mock;
};

const tokenValidationMock = jest.requireMock('@/lib/token-validation') as {
  validateTournamentToken: jest.Mock;
};

describe('Token Management API Routes', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/tournaments/[id]/token/extend', () => {

    describe('Authorization', () => {
      it('should return 401 when not authenticated', async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Unauthorized',
          }),
          { status: 401 }
        );
      });
    });

    describe('Rate Limiting', () => {
      it('should enforce rate limiting on token extension', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (rateLimitMock.checkRateLimit as jest.Mock).mockResolvedValue({
          success: false,
          retryAfter: 60,
        });
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 0 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Extension hours must be between 1 and 168',
          }),
          { status: 400 }
        );
      });

      it('should return 400 when extensionHours > 168', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (rateLimitMock.checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 200 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Extension hours must be between 1 and 168',
          }),
          { status: 400 }
        );
      });
    });

    describe('Success Cases', () => {
      it('should extend token expiry successfully', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (rateLimitMock.checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const mockTournament = {
          id: 't1',
          token: 'existing-token',
          tokenExpiresAt: new Date('2024-01-15T12:00:00.000Z'),
        };

        const expectedNewExpiry = tokenUtilsMock.extendTokenExpiry(
          mockTournament.tokenExpiresAt,
          24
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        auditLogMock.createAuditLog.mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          headers: { 'user-agent': 'test-agent' },
          body: JSON.stringify({ extensionHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(tokenUtilsMock.extendTokenExpiry).toHaveBeenCalledWith(
          mockTournament.tokenExpiresAt,
          24
        );

        expect(prisma.tournament.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't1' },
          data: {
            tokenExpiresAt: expectedNewExpiry,
          },
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalled();

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: {
              newExpiryDate: expectedNewExpiry.toISOString(),
              extensionHours: 24,
              timeRemaining: expect.any(String),
            },
          }),
          { status: 200 }
        );
      });

      it('should create audit log on successful extension', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (rateLimitMock.checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
          id: 't1',
          token: 'existing-token',
        });
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        auditLogMock.createAuditLog.mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(auditLogMock.createAuditLog).toHaveBeenCalled();
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when tournament not found', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (rateLimitMock.checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'No token exists for this tournament',
          }),
          { status: 400 }
        );
      });

      it('should handle database errors gracefully', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (rateLimitMock.checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (rateLimitMock.getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/extend/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.any(String),
          }),
          { status: 500 }
        );
      });
    });
  });

  describe('POST /api/tournaments/[id]/token/validate', () => {
    describe('Missing Token', () => {
      it('should return 401 when token is not provided', async () => {
        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Token required',
          }),
          { status: 401 }
        );
      });

      it('should return 401 when token is empty string', async () => {
        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: '' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Token required',
          }),
          { status: 401 }
        );
      });
    });

    describe('Invalid Token Format', () => {
      it('should return 401 when token has invalid format (not 32 char hex)', async () => {
        tokenValidationMock.validateTournamentToken.mockResolvedValue({
          valid: false,
          error: 'Invalid token format',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'invalid-token' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Invalid token format',
          }),
          { status: 401 }
        );
      });

      it('should return 401 when token has invalid format (special chars)', async () => {
        tokenValidationMock.validateTournamentToken.mockResolvedValue({
          valid: false,
          error: 'Invalid token format',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: '1234!@#$' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Invalid token format',
          }),
          { status: 401 }
        );
      });
    });

    describe('Tournament Not Found', () => {
      it('should return 401 when tournament does not exist', async () => {
        tokenValidationMock.validateTournamentToken.mockResolvedValue({
          valid: false,
          error: 'Tournament not found',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Tournament not found',
          }),
          { status: 401 }
        );
      });
    });

    describe('Token Expired', () => {
      it('should return 401 when token is expired', async () => {
        tokenValidationMock.validateTournamentToken.mockResolvedValue({
          valid: false,
          tournament: {
            id: 't1',
            name: 'Test Tournament',
          },
          error: 'Token invalid or expired',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Token invalid or expired',
          }),
          { status: 401 }
        );
      });
    });

    describe('Success Cases', () => {
      it('should validate valid token successfully', async () => {
        const mockTournament = {
          id: 't1',
          name: 'Test Tournament',
          token: 'valid-token-32chars',
          tokenExpiresAt: new Date('2024-02-01T12:00:00.000Z'),
        };

        tokenValidationMock.validateTournamentToken.mockResolvedValue({
          valid: true,
          tournament: mockTournament,
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: {
              tournamentId: 't1',
              tournamentName: 'Test Tournament',
              tokenValid: true,
            },
          }),
          { status: 200 }
        );
      });
    });

    describe('Error Cases', () => {
      it('should handle database errors gracefully', async () => {
        tokenValidationMock.validateTournamentToken.mockRejectedValue(new Error('Database error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/validate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Token validation failed',
          }),
          { status: 500 }
        );
      });
    });
  });

  describe('POST /api/tournaments/[id]/token/regenerate', () => {
    describe('Authorization', () => {
      it('should return 401 when not authenticated', async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Unauthorized',
          }),
          { status: 401 }
        );
      });
    });

    describe('Validation', () => {
      it('should return 400 when expiresInHours < 1', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 0 });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 0 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Token expiry must be between 1 and 168 hours',
          }),
          { status: 400 }
        );
      });

      it('should return 400 when expiresInHours > 168', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 200 });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 200 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Token expiry must be between 1 and 168 hours',
          }),
          { status: 400 }
        );
      });
    });

    describe('Success Cases', () => {
      it('should regenerate token successfully', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        tokenUtilsMock.generateTournamentToken.mockReturnValue('new-generated-token');
        tokenUtilsMock.getTokenExpiry.mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        const mockTournament = {
          id: 't1',
          name: 'Test Tournament',
          token: 'old-token',
        };

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        auditLogMock.createAuditLog.mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          headers: { 'user-agent': 'test-agent' },
          body: JSON.stringify({ expiresInHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(tokenUtilsMock.generateTournamentToken).toHaveBeenCalled();

        expect(prisma.tournament.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 't1' },
            data: {
              token: 'new-generated-token',
              tokenExpiresAt: new Date('2024-02-02T12:00:00.000Z'),
            },
            select: {
              id: true,
              name: true,
              token: true,
              tokenExpiresAt: true,
          },
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'REGENERATE_TOKEN',
          targetId: 't1',
          targetType: 'Tournament',
          details: expect.objectContaining({
            newToken: expect.stringMatching(/^new-.+ \.\.\.$/),
            expiresInHours: 24,
            newExpiry: expect.any(String),
          }),
        })
      );

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: {
              token: 'new-generated-token',
              expiresAt: new Date('2024-02-02T12:00:00.000Z').toISOString(),
              expiresInHours: 24,
            },
          }),
          { status: 200 }
        );
      });

      it('should create audit log on successful regeneration', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        tokenUtilsMock.generateTournamentToken.mockReturnValue('new-generated-token');
        tokenUtilsMock.getTokenExpiry.mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        auditLogMock.createAuditLog.mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
        body: JSON.stringify({ expiresInHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(auditLogMock.createAuditLog).toHaveBeenCalled();
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when tournament not found (P2025)', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        tokenUtilsMock.generateTournamentToken.mockReturnValue('new-generated-token');
        tokenUtilsMock.getTokenExpiry.mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockRejectedValue(
          { code: 'P2025' } as PrismaError
        );

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Tournament not found',
          }),
          { status: 404 }
        );
      });

      it('should handle database errors gracefully', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        tokenUtilsMock.generateTournamentToken.mockReturnValue('new-generated-token');
        tokenUtilsMock.getTokenExpiry.mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockRejectedValue(new Error('Database error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.any(String),
          }),
          { status: 500 }
        );
      });

      it('should handle audit log failures gracefully', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        tokenUtilsMock.generateTournamentToken.mockReturnValue('new-generated-token');
        tokenUtilsMock.getTokenExpiry.mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        auditLogMock.createAuditLog.mockRejectedValue(new Error('Audit log error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

const route = (jest.requireMock('@/app/api/tournaments/[id]/token/regenerate/route') as any).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(logger.warn).toHaveBeenCalledWith(
          'Failed to create audit log',
          expect.any(Object)
        );

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.any(Object),
          }),
          { status: 200 }
        );
      });
    });
  });
});
