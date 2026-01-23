// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    player: {
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

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('@/lib/password-utils', () => ({
  generateSecurePassword: jest.fn(() => 'test-password'),
  hashPassword: jest.fn(() => Promise.resolve('hashed-password')),
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { sanitizeInput } from '@/lib/sanitize';
import { generateSecurePassword, hashPassword } from '@/lib/password-utils';
import { createAuditLog } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import * as playerRoute from '@/app/api/players/route';

const logger = createLogger('players-route-test');

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

      const response = await playerRoute.POST(request);
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

      const response = await playerRoute.POST(request);
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
      (sanitizeInput as jest.Mock).mockReturnValue({ nickname: 'test' });

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ nickname: 'test' }),
      });

      const response = await playerRoute.POST(request);
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
      (sanitizeInput as jest.Mock).mockReturnValue({ name: 'Test Player' });

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player' }),
      });

      const response = await playerRoute.POST(request);
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
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
        country: 'JP',
      });
      (generateSecurePassword as jest.Mock).mockReturnValue('generated-password');
      (hashPassword as jest.Mock).mockResolvedValue('hashed-password');
      (prisma.player.create as jest.Mock).mockResolvedValue(mockPlayer);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({
          name: 'Test Player',
          nickname: 'test',
          country: 'JP',
        }),
      });

      const response = await playerRoute.POST(request);

      // Verify player was created with hashed password
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

      // Verify audit log was created
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          action: 'CREATE_PLAYER',
          targetId: 'player-1',
          targetType: 'Player',
        })
      );

      // Verify response
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
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
      });
      (generateSecurePassword as jest.Mock).mockReturnValue('generated-password');
      (hashPassword as jest.Mock).mockResolvedValue('hashed-password');
      (prisma.player.create as jest.Mock).mockResolvedValue(mockPlayer);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      (getServerSideIdentifier as jest.Mock).mockResolvedValue('127.0.0.1');

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        headers: { 'user-agent': 'test-agent' },
        body: JSON.stringify({ name: 'Test Player', nickname: 'test' }),
      });

      await playerRoute.POST(request);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          action: 'CREATE_PLAYER',
          targetType: 'Player',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database creation errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'test',
      });
      (generateSecurePassword as jest.Mock).mockReturnValue('generated-password');
      (hashPassword as jest.Mock).mockResolvedValue('hashed-password');
      (prisma.player.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'test' }),
      });

      await playerRoute.POST(request);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create player',
        expect.any(Object)
      );
    });

    it('should handle unique constraint violation (P2002) with 409 status', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (sanitizeInput as jest.Mock).mockReturnValue({
        name: 'Test Player',
        nickname: 'existing-test',
      });
      (generateSecurePassword as jest.Mock).mockReturnValue('generated-password');
      (hashPassword as jest.Mock).mockResolvedValue('hashed-password');
      const prismaError = new Error('Unique constraint failed') as Error & { code?: string };
      prismaError.code = 'P2002';
      (prisma.player.create as jest.Mock).mockRejectedValue(prismaError);

      const request = new NextRequest('http://localhost:3000/api/players', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Player', nickname: 'existing-test' }),
      });

      await playerRoute.POST(request);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create player',
        expect.any(Object)
      );
    });
  });
});
