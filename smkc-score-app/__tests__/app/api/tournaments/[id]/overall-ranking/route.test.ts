/**
 * @module Overall Ranking Route Tests
 *
 * Test suite for GET and POST /api/tournaments/[id]/overall-ranking.
 *
 * GET: Public - fetch stored overall rankings
 *   - Returns rankings with tournament name and lastUpdated
 *   - Returns empty array when no rankings calculated yet
 *   - Returns 404 when tournament not found
 *   - Returns 500 on database errors
 *
 * POST: Admin only - recalculate and save overall rankings
 *   - Returns 401 for unauthenticated users
 *   - Returns 403 for non-admin users
 *   - Returns 404 when tournament not found
 *   - Calculates and saves rankings on success
 *   - Returns 500 on calculation errors
 */
// @ts-nocheck

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options) => ({
      data,
      status: options?.status ?? 200,
    })),
  },
  NextRequest: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/points/overall-ranking', () => ({
  calculateOverallRankings: jest.fn(),
  saveOverallRankings: jest.fn(),
  getOverallRankings: jest.fn(),
}));

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  calculateOverallRankings,
  saveOverallRankings,
  getOverallRankings,
} from '@/lib/points/overall-ranking';
import { GET, POST } from '@/app/api/tournaments/[id]/overall-ranking/route';

const mockParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('Overall Ranking Route', () => {
  const mockTournament = {
    id: 'tournament-1',
    name: 'Test Tournament 2026',
    status: 'active',
  };

  const mockRankings = [
    {
      playerId: 'player-1',
      playerName: 'Player One',
      playerNickname: 'P1',
      totalPoints: 5000,
      overallRank: 1,
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
    {
      playerId: 'player-2',
      playerName: 'Player Two',
      playerNickname: 'P2',
      totalPoints: 4000,
      overallRank: 2,
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (NextResponse.json as jest.Mock).mockImplementation((data, options) => ({
      data,
      status: options?.status ?? 200,
    }));
  });

  describe('GET /api/tournaments/[id]/overall-ranking', () => {
    it('returns stored rankings for a valid tournament', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (getOverallRankings as jest.Mock).mockResolvedValue(mockRankings);

      const response = await GET(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.rankings).toEqual(mockRankings);
      expect(response.data.data.tournamentId).toBe('tournament-1');
      expect(response.data.data.tournamentName).toBe('Test Tournament 2026');
    });

    it('returns empty rankings array when no rankings calculated yet', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (getOverallRankings as jest.Mock).mockResolvedValue([]);

      const response = await GET(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.rankings).toEqual([]);
      /* lastUpdated falls back to now() when rankings is empty */
      expect(response.data.data.lastUpdated).toBeDefined();
      expect(() => new Date(response.data.data.lastUpdated)).not.toThrow();
    });

    it('returns a valid lastUpdated timestamp derived from rankings', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (getOverallRankings as jest.Mock).mockResolvedValue(mockRankings);

      const response = await GET(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(200);
      /* lastUpdated should be a valid ISO date string derived from updatedAt */
      const { lastUpdated } = response.data.data;
      expect(lastUpdated).toBeDefined();
      expect(new Date(lastUpdated).toISOString()).toBe(lastUpdated);
    });

    it('returns 404 when tournament is not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await GET(
        {} as any,
        mockParams('nonexistent-id')
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toMatch(/not found/i);
    });

    it('returns 500 on database errors', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await GET(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
    });
  });

  describe('POST /api/tournaments/[id]/overall-ranking', () => {
    it('returns 401 for unauthenticated users', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });

    it('returns 403 for non-admin users', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      const response = await POST(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
    });

    it('returns 404 when tournament not found', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await POST(
        {} as any,
        mockParams('nonexistent-id')
      );

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });

    it('calculates and saves overall rankings on success', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (calculateOverallRankings as jest.Mock).mockResolvedValue(mockRankings);
      (saveOverallRankings as jest.Mock).mockResolvedValue(undefined);

      const response = await POST(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.rankings).toEqual(mockRankings);
      expect(response.data.data.tournamentName).toBe('Test Tournament 2026');
      expect(calculateOverallRankings).toHaveBeenCalledWith(
        prisma,
        'tournament-1'
      );
      expect(saveOverallRankings).toHaveBeenCalledWith(
        prisma,
        'tournament-1',
        mockRankings
      );
    });

    it('returns 500 when saveOverallRankings fails', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (calculateOverallRankings as jest.Mock).mockResolvedValue(mockRankings);
      (saveOverallRankings as jest.Mock).mockRejectedValue(
        new Error('DB write failed')
      );

      const response = await POST(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
    });

    it('returns 500 when calculation fails', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (calculateOverallRankings as jest.Mock).mockRejectedValue(
        new Error('Calculation failed')
      );

      const response = await POST(
        {} as any,
        mockParams('tournament-1')
      );

      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
    });
  });
});
