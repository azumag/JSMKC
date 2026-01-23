// @ts-nocheck - This test file uses complex mock types for Next.js API routes
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
import { createAuditLog } from '@/lib/audit-log';
import { checkRateLimit, getServerSideIdentifier } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/sanitize';
import { generateTournamentToken, getTokenExpiry, extendTokenExpiry } from '@/lib/token-utils';
import { validateTournamentToken } from '@/lib/token-validation';
import { createLogger } from '@/lib/logger';
import * as extendRoute from '@/app/api/tournaments/[id]/token/extend/route';
import * as validateRoute from '@/app/api/tournaments/[id]/token/validate/route';
import * as regenerateRoute from '@/app/api/tournaments/[id]/token/regenerate/route';

describe('Token Management API Routes', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/tournaments/[id]/token/extend', () => {
    const logger = createLogger('token-extend-api-test');

    describe('Authorization', () => {
      it('should return 401 when not authenticated', async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (checkRateLimit as jest.Mock).mockResolvedValue({
          success: false,
          retryAfter: 60,
        });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Too many requests. Please try again later.',
            retryAfter: 60,
          }),
          expect.objectContaining({
            status: 429,
            headers: expect.objectContaining({
              'X-RateLimit-Limit': expect.any(String),
              'X-RateLimit-Remaining': expect.any(String),
              'X-RateLimit-Reset': expect.any(String),
            }),
          })
        );
      });

      it('should allow requests under rate limit', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (checkRateLimit as jest.Mock).mockResolvedValue({
          success: true,
        });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const mockTournament = {
          id: 't1',
          token: 'existing-token',
          tokenExpiresAt: new Date('2024-01-15T12:00:00.000Z'),
        };

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        (createAuditLog as jest.Mock).mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          }),
          { status: 200 }
        );
      });
    });

    describe('Validation', () => {
      it('should return 400 when extensionHours < 1', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 0 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 200 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        const mockTournament = {
          id: 't1',
          token: 'existing-token',
          tokenExpiresAt: new Date('2024-01-15T12:00:00.000Z'),
        };

        const expectedNewExpiry = extendTokenExpiry(
          mockTournament.tokenExpiresAt,
          24
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        (createAuditLog as jest.Mock).mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          headers: { 'user-agent': 'test-agent' },
          body: JSON.stringify({ extensionHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(extendTokenExpiry).toHaveBeenCalledWith(
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

        expect(createAuditLog).toHaveBeenCalled();

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
        (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
          id: 't1',
          token: 'existing-token',
        });
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        (createAuditLog as jest.Mock).mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(createAuditLog).toHaveBeenCalled();
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when tournament not found', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
        (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

        (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/extend', {
          method: 'POST',
          body: JSON.stringify({ extensionHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/extend/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
    const logger = createLogger('token-validate-api-test');

    describe('Missing Token', () => {
      it('should return 401 when token is not provided', async () => {
        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
        });

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (validateTournamentToken as jest.Mock).mockResolvedValue({
          valid: false,
          error: 'Invalid token format',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'invalid-token' }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(NextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Invalid token format',
          }),
          { status: 401 }
        );
      });

      it('should return 401 when token has invalid format (special chars)', async () => {
        (validateTournamentToken as jest.Mock).mockResolvedValue({
          valid: false,
          error: 'Invalid token format',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: '1234!@#$' }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (validateTournamentToken as jest.Mock).mockResolvedValue({
          valid: false,
          error: 'Tournament not found',
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (validateTournamentToken as jest.Mock).mockResolvedValue({
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

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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

        (validateTournamentToken as jest.Mock).mockResolvedValue({
          valid: true,
          tournament: mockTournament,
        });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (validateTournamentToken as jest.Mock).mockRejectedValue(new Error('Database error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/validate', {
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-32chars' }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/validate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
    const logger = createLogger('token-regenerate-api-test');

    describe('Authorization', () => {
      it('should return 401 when not authenticated', async () => {
        (auth as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 0 });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 0 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 200 });

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 200 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        (generateTournamentToken as jest.Mock).mockReturnValue('new-generated-token');
        (getTokenExpiry as jest.Mock).mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        const mockTournament = {
          id: 't1',
          name: 'Test Tournament',
          token: 'old-token',
        };

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        (createAuditLog as jest.Mock).mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          headers: { 'user-agent': 'test-agent' },
          body: JSON.stringify({ expiresInHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(generateTournamentToken).toHaveBeenCalled();

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

        expect(createAuditLog).toHaveBeenCalledWith(
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
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        (generateTournamentToken as jest.Mock).mockReturnValue('new-generated-token');
        (getTokenExpiry as jest.Mock).mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        (createAuditLog as jest.Mock).mockResolvedValue(undefined);

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
        body: JSON.stringify({ expiresInHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        await route(request, { params: Promise.resolve({ id: 't1' }) });

        expect(createAuditLog).toHaveBeenCalled();
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when tournament not found (P2025)', async () => {
        (auth as jest.Mock).mockResolvedValue({
          user: { id: 'admin-1' },
        });
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        (generateTournamentToken as jest.Mock).mockReturnValue('new-generated-token');
        (getTokenExpiry as jest.Mock).mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockRejectedValue(
          { code: 'P2025' } as any
        );

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        (generateTournamentToken as jest.Mock).mockReturnValue('new-generated-token');
        (getTokenExpiry as jest.Mock).mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockRejectedValue(new Error('Database error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
        (sanitizeInput as jest.Mock).mockReturnValue({ expiresInHours: 24 });
        (generateTournamentToken as jest.Mock).mockReturnValue('new-generated-token');
        (getTokenExpiry as jest.Mock).mockReturnValue(
          new Date('2024-02-02T12:00:00.000Z')
        );

        (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
        (prisma.tournament.update as jest.Mock).mockResolvedValue({});
        (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log error'));

        const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token/regenerate', {
          method: 'POST',
          body: JSON.stringify({ expiresInHours: 24 }),
        });

        const route = (await import('@/app/api/tournaments/[id]/token/regenerate/route')).POST;
        const response = await route(request, { params: Promise.resolve({ id: 't1' }) });

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
