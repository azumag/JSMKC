// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';



jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    CREATE_PLAYER_LINK: 'CREATE_PLAYER_LINK',
  },
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

const auditLogMock = jest.requireMock('@/lib/audit-log') as {
  createAuditLog: jest.Mock;
  AUDIT_ACTIONS: typeof import('@/lib/audit-log').AUDIT_ACTIONS;
};

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

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({ targetPlayerId: 'player-2' }),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
        }),
        { status: 401 }
      );
    });

    it('should allow admins to link players', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({ targetPlayerId: 'player-2' }),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.any(Object),
        { status: 200 }
      );
    });
  });

  describe('Validation', () => {
    it('should return 404 when player does not exist', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({ targetPlayerId: 'player-2' }),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 404 }
      );
    });

    it('should return 400 when targetPlayerId is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        }),
        { status: 400 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should link player successfully', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
        userId: 'existing-user-2',
        createdAt: new Date(),
      };
      const mockPlayerLink = {
        id: 'link-1',
        playerId: 'player-1',
        targetPlayerId: 'player-2',
        userId: 'existing-user-2',
        createdAt: new Date(),
      };
      const updatedPlayer = {
        id: 'player-1',
        name: 'Updated Player 1',
        nickname: 'player1',
        userId: 'existing-user-2',
        createdAt: new Date(),
        linkedAt: new Date(),
        links: {
          create: {
            id: 'link-1',
            playerId: 'player-1',
            targetPlayerId: 'player-2',
            userId: 'existing-user-2',
            createdAt: new Date(),
          },
        },
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(mockPlayer);
      (prisma.player.update as jest.Mock).mockResolvedValue(updatedPlayer);
      (prisma.player.findMany as jest.Mock)
        .mockResolvedValue([mockPlayerLink])
        .mockResolvedValueOnce([mockPlayerLink]);
      (prisma.player.create as jest.Mock).mockResolvedValue(mockPlayerLink);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({ targetPlayerId: 'player-2' }),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-2' },
      });

      expect(prisma.player.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'player-1' },
          data: expect.objectContaining({
            linkedAt: expect.any(Date),
          }),
        })
      );

      expect(prisma.player.findMany).toHaveBeenCalledWith({
        where: { linkedToPlayerId: 'player-1' },
      });

      expect(prisma.player.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: expect.any(String),
            playerId: 'player-1',
            targetPlayerId: 'player-2',
            userId: 'existing-user-2',
          }),
        })
      );

      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: auditLogMock.AUDIT_ACTIONS.CREATE_PLAYER_LINK,
          targetId: 'link-1',
          targetType: 'PlayerLink',
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          player: mockPlayer,
          playerLinks: [mockPlayerLink],
        }),
        { status: 200 }
      );
    });

    it('should create player link when not already linked', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
      };
      const mockPlayerLink = {
        id: 'link-1',
        playerId: 'player-1',
        targetPlayerId: 'player-2',
        userId: 'existing-user-2',
        createdAt: new Date(),
      };
      const updatedPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
        linkedAt: new Date(),
        links: {
          create: {
            id: 'link-1',
            playerId: 'player-1',
            targetPlayerId: 'player-2',
            userId: 'existing-user-2',
            createdAt: new Date(),
          },
        },
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(mockPlayer);
      (prisma.player.update as jest.Mock).mockResolvedValue(updatedPlayer);
      (prisma.player.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.player.findMany as jest.Mock).mockResolvedValue([mockPlayerLink]);
      (prisma.player.create as jest.Mock).mockResolvedValue(mockPlayerLink);
      auditLogMock.createAuditLog.mockResolvedValue(undefined);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({ targetPlayerId: 'player-2' }),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(prisma.player.findMany).toHaveBeenCalledWith({
        where: { linkedToPlayerId: 'player-1' },
      });

      expect(prisma.player.findMany).toHaveBeenCalledTimes(1);

      expect(prisma.player.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: expect.any(String),
            playerId: 'player-1',
            targetPlayerId: 'player-2',
            userId: 'existing-user-2',
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({ targetPlayerId: 'player-2' }),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to create player link' },
        { status: 500 }
      );
    });
  });
});
