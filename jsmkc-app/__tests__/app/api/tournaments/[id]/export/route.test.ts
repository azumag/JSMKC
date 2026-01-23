import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('@/lib/excel', () => ({
  formatTime: jest.fn(() => '1:23.456'),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn(),
    __esModule: true,
  },
}));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { formatTime } from '@/lib/excel';
import * as exportRoute from '@/app/api/tournaments/[id]/export/route';

const logger = createLogger('tournament-export-test');

type MockCall = [unknown, Record<string, unknown>?];

describe('GET /api/tournaments/[id]/export', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should export tournament with BM data to CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [
          {
            id: 'q1',
            playerId: 'p1',
            tournamentId: 't1',
            group: 'A',
            seeding: 1,
            mp: 3,
            wins: 2,
            ties: 0,
            losses: 1,
            points: 1,
            score: 4,
            player: {
              id: 'p1',
              name: 'Player 1',
              nickname: 'p1',
            },
          },
        ],
        bmMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 3,
            score2: 1,
            completed: true,
            rounds: [
              { arena: 1, winner: 1 },
              { arena: 2, winner: 2 },
              { arena: 3, winner: 1 },
              { arena: 4, winner: 1 },
            ],
            player1: {
              id: 'p1',
              name: 'Player 1',
              nickname: 'p1',
            },
            player2: {
              id: 'p2',
              name: 'Player 2',
              nickname: 'p2',
            },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: {
          bmQualifications: { include: { player: true } },
          bmMatches: { include: { player1: true, player2: true } },
          mrMatches: { include: { player1: true, player2: true } },
          gpMatches: { include: { player1: true, player2: true } },
          ttEntries: { include: { player: true } },
        },
      });

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[0] && typeof call[0] === 'string' && call[0].includes('TOURNAMENT SUMMARY')
      );

      expect(responseCall).toBeDefined();
      const csvContent = responseCall[0];
      expect(csvContent).toContain('TOURNAMENT SUMMARY');
      expect(csvContent).toContain('Test Tournament');
      expect(csvContent).toContain('Battle Mode');
      expect(csvContent).toContain('BM Group A');
      expect(csvContent).toContain('Player 1');
      expect(csvContent).toContain('BM Qualification Matches');
    });

    it('should export tournament with MR data to CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'MR Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [
          {
            id: 'mr1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            round: 1,
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 2,
            score2: 1,
            completed: true,
            player1: {
              id: 'p1',
              name: 'Player 1',
              nickname: 'p1',
            },
            player2: {
              id: 'p2',
              name: 'Player 2',
              nickname: 'p2',
            },
          },
        ],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[0] && typeof call[0] === 'string'
      );

      expect(responseCall).toBeDefined();
      const csvContent = responseCall[0] as string;
      expect(csvContent).toContain('Match Race Matches');
      expect(csvContent).toContain('Player 1');
      expect(csvContent).toContain('2 - 1');
    });

    it('should export tournament with GP data to CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'GP Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [
          {
            id: 'gp1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            points1: 8,
            points2: 4,
            completed: true,
            player1: {
              id: 'p1',
              name: 'Player 1',
              nickname: 'p1',
            },
            player2: {
              id: 'p2',
              name: 'Player 2',
              nickname: 'p2',
            },
          },
        ],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[0] && typeof call[0] === 'string' && call[0].includes('Grand Prix Matches')
      );

      expect(responseCall).toBeDefined();
      const csvContent = responseCall[0];
      expect(csvContent).toContain('Grand Prix Matches');
      expect(csvContent).toContain('8');
      expect(csvContent).toContain('4');
    });

    it('should export tournament with TA data to CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'TA Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'ta1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            rank: 1,
            totalTime: 83456,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: {
              id: 'p1',
              name: 'Player 1',
              nickname: 'p1',
            },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[0] && typeof call[0] === 'string' && call[0].includes('Time Attack Entries')
      );

      expect(responseCall).toBeDefined();
      const csvContent = responseCall[0];
      expect(csvContent).toContain('Time Attack Entries');
      expect(csvContent).toContain('Player 1');
      expect(formatTime).toHaveBeenCalledWith(83456);
    });

    it('should set correct Content-Type and Content-Disposition headers', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[1] && typeof call[1] === 'object' && call[1] && 'headers' in call[1]
      );

      expect(responseCall).toBeDefined();
      expect((responseCall[1] as Record<string, unknown>).headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect((responseCall[1] as Record<string, unknown>).headers['Content-Disposition']).toContain('attachment');
      expect((responseCall[1] as Record<string, unknown>).headers['Content-Disposition']).toContain('Test_Tournament-full-2024-01-15.csv');
    });
  });

  describe('CSV Formatting', () => {
    it('should handle special characters in tournament name for filename', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test/Tournament!2024',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[1] && typeof call[1] === 'object' && call[1] && 'headers' in call[1]
      );

      expect(responseCall).toBeDefined();
      const filename = (responseCall[1] as Record<string, unknown>).headers['Content-Disposition'] as string;
      // Special characters should be replaced with underscores
      expect(filename).toContain('Test_Tournament_2024-full-');
      expect(filename).not.toContain('!');
      expect(filename).not.toContain('/');
    });

    it('should include BOM for UTF-8 compatibility', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[0] && typeof call[0] === 'string'
      );

      expect(responseCall).toBeDefined();
      const csvContent = responseCall[0] as string;
      // BOM (Byte Order Mark) for UTF-8
      expect(csvContent.charCodeAt(0)).toBe(0xFEFF);
    });

    it('should escape commas in CSV fields', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test, Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [
          {
            id: 'q1',
            playerId: 'p1',
            tournamentId: 't1',
            group: 'A',
            seeding: 1,
            mp: 3,
            wins: 2,
            ties: 0,
            losses: 1,
            points: 1,
            score: 4,
            player: {
              id: 'p1',
              name: 'Player, One',
              nickname: 'p,1',
            },
          },
        ],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const responseCall = (NextResponse as unknown as jest.Mocked<typeof NextResponse>).mock.calls.find(
        (call: MockCall) => call[0] && typeof call[0] === 'string'
      );

      expect(responseCall).toBeDefined();
      const csvContent = responseCall[0] as string;
      // Commas should be escaped with double quotes
      expect(csvContent).toContain('"Player, One"');
      expect(csvContent).toContain('"p,1"');
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
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
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await exportRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/export'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to export tournament',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to export tournament data',
        }),
        { status: 500 }
      );
    });
  });
});
