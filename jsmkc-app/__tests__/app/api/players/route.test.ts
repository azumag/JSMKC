// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Note: prisma.player methods are mocked globally in jest.setup.js
// Do not re-mock prisma here to avoid conflicts

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
  })),
}));

jest.mock('@/lib/pagination', () => ({
  paginate: jest.fn(),
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
import { createLogger } from '@/lib/logger';
import { paginate } from '@/lib/pagination';
import * as playerRoute from '@/app/api/players/route';

const logger = createLogger('players-route-test');

describe('GET /api/players', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock paginate to return pagination result
    (paginate as jest.Mock).mockImplementation(async () => ({
      data: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
      },
    }));
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

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      expect(prisma.player.findMany).toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalled();
    });

    it('should filter out soft deleted players', async () => {
      const mockPlayers = [{ id: 'p1', name: 'Active Player', nickname: 'active' }];

      (prisma.player.findMany as jest.Mock).mockResolvedValue(mockPlayers);
      (prisma.player.count as jest.Mock).mockResolvedValue(1);

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

      expect(prisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        })
      );
      expect(NextResponse.json).toHaveBeenCalled();
    });
  });

  describe('Error Cases', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.player.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await playerRoute.GET(
        new NextRequest('http://localhost:3000/api/players')
      );

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

  describe('Success Cases', () => {
    it('should create player successfully with valid data', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Test Player',
        nickname: 'test',
        country: 'JP',
        password: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.create as jest.Mock).mockResolvedValue(mockPlayer);

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

      expect(prisma.player.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Player',
            nickname: 'test',
            country: 'JP',
          }),
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          player: mockPlayer,
        }),
        { status: 201 }
      );
    });
  });

  describe('Error Cases', () => {
    it('should handle database creation errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
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
  });
});
