// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    player: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
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
import * as linkRoute from '@/app/api/players/[id]/link/route';

describe('POST /api/players/[id]/link', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1/link', {
        method: 'POST',
      });

      const route = (await import('@/app/api/players/[id]/link/route')).POST;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });
  });

  describe('Validation - Player Not Found', () => {
    it('should return 404 when player does not exist', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/players/player-1/link', {
        method: 'POST',
      });

      const route = (await import('@/app/api/players/[id]/link/route')).POST;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });
  });

  describe('Validation - Player Already Linked', () => {
    it('should return 409 when player is already linked to a user', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        userId: 'existing-user-2',
      });

      const request = new NextRequest('http://localhost:3000/api/players/player-1/link', {
        method: 'POST',
      });

      const route = (await import('@/app/api/players/[id]/link/route')).POST;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player already linked to a user',
        }),
        { status: 409 }
      );
    });
  });

  describe('Validation - User Already Linked', () => {
    it('should return 409 when user is already linked to a player', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'player-1', userId: null })
        .mockResolvedValueOnce({ id: 'player-2', userId: 'user-1' });

      const request = new NextRequest('http://localhost:3000/api/players/player-1/link', {
        method: 'POST',
      });

      const route = (await import('@/app/api/players/[id]/link/route')).POST;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'You are already linked to a player profile',
        }),
        { status: 409 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should link user to player successfully', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Test Player',
        nickname: 'test',
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        userId: null,
      });
      (prisma.player.update as jest.Mock).mockResolvedValue(mockPlayer);

      const request = new NextRequest('http://localhost:3000/api/players/player-1/link', {
        method: 'POST',
      });

      const route = (await import('@/app/api/players/[id]/link/route')).POST;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(prisma.player.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.player.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'player-1' },
          data: { userId: 'user-1' },
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(mockPlayer);
    });
  });

  describe('Error Cases', () => {
    it('should return 500 on database error', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1' },
      });
      (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/players/player-1/link', {
        method: 'POST',
      });

      const route = (await import('@/app/api/players/[id]/link/route')).POST;
      const response = await route(request, { params: Promise.resolve({ id: 'player-1' }) });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to link player',
        }),
        { status: 500 }
      );
    });
  });
});
