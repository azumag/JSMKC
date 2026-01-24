// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/excel', () => ({ formatDate: jest.fn(() => '2024-01-15'), formatTime: jest.fn(() => '1:23.456') }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { formatDate, formatTime } from '@/lib/excel';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/export/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

class MockNextRequest {
  constructor(private url: string) {}
  headers = {
    get: () => undefined,
  };
}

describe('Export API Route - /api/tournaments/[id]/export', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    NextResponseMock.json.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
    (formatDate as jest.Mock).mockReturnValue('2024-01-15');
    (formatTime as jest.Mock).mockReturnValue('1:23.456');
  });

  describe('GET - Export tournament data as CSV', () => {
    it('should export tournament data with summary section', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toBeDefined();
      expect(result.data).toContain('TOURNAMENT SUMMARY');
      expect(result.data).toContain('Test Tournament 2024');
      expect(result.data).toContain('Date');
      expect(result.data).toContain('Status');
      expect(result.data).toContain('Battle Mode');
      expect(result.data).toContain('Match Race');
      expect(result.data).toContain('Grand Prix');
      expect(result.data).toContain('Time Attack');
      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        include: {
          bmQualifications: { include: { player: true } },
          bmMatches: { include: { player1: true, player2: true } },
          mrMatches: { include: { player1: true, player2: true } },
          gpMatches: { include: { player1: true, player2: true } },
          ttEntries: { include: { player: true } },
        },
      });
    });

    it('should export BM qualification data grouped by group', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [
          {
            id: 'q1',
            tournamentId: 't1',
            playerId: 'p1',
            group: 'A',
            seeding: 1,
            mp: 3,
            wins: 2,
            ties: 1,
            losses: 0,
            points: 6,
            score: 10,
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'q2',
            tournamentId: 't1',
            playerId: 'p2',
            group: 'B',
            seeding: 1,
            mp: 3,
            wins: 1,
            ties: 1,
            losses: 1,
            points: 0,
            score: 6,
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('BM Group A');
      expect(result.data).toContain('BM Group B');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('Rank');
      expect(result.data).toContain('Matches Played');
      expect(result.data).toContain('Wins');
    });

    it('should export BM qualification matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
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
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('BM Qualification Matches');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('3 - 1');
      expect(result.data).toContain('Arena 1: P1 wins');
      expect(result.data).toContain('Arena 2: P2 wins');
    });

    it('should export BM finals matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'finals',
            round: 1,
            tvNumber: 1,
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 3,
            score2: 1,
            completed: true,
            rounds: [
              { arena: 1, winner: 1 },
              { arena: 2, winner: 1 },
              { arena: 3, winner: 1 },
            ],
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('BM Finals Matches');
      expect(result.data).toContain('Round');
      expect(result.data).toContain('TV #');
      expect(result.data).toContain('1');
    });

    it('should export Match Race matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            round: 1,
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 2,
            score2: 1,
            completed: true,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Match Race Matches');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('2 - 1');
      expect(result.data).toContain('Stage');
      expect(result.data).toContain('Round');
    });

    it('should export Grand Prix matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            points1: 18,
            points2: 6,
            completed: true,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Grand Prix Matches');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('18');
      expect(result.data).toContain('6');
      expect(result.data).toContain('Points P1');
      expect(result.data).toContain('Points P2');
    });

    it('should export Time Attack entries', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'e1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 83456,
            rank: 1,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'e2',
            playerId: 'p2',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 98765,
            rank: 2,
            lives: 0,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Time Attack Entries');
      expect(result.data).toContain('Player 1');
      expect(result.data).toContain('Player 2');
      expect(result.data).toContain('Rank');
      expect(result.data).toContain('Total Time');
      expect(result.data).toContain('Lives');
      expect(result.data).toContain('Date');
      expect(formatTime).toHaveBeenCalledWith(83456);
      expect(formatTime).toHaveBeenCalledWith(98765);
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

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers).toBeDefined();
      expect(result.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(result.headers['Content-Disposition']).toContain('attachment');
      expect(result.headers['Content-Disposition']).toContain('.csv');
    });

    it('should generate filename with tournament name and date', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toContain('Test_Tournament_2024-full-2024-01-15.csv');
    });

    it('should replace special characters in tournament name for filename', async () => {
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

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toContain('Test_Tournament_2024-full-');
      expect(result.headers['Content-Disposition']).not.toContain('/');
      expect(result.headers['Content-Disposition']).not.toContain('!');
    });

    it('should include UTF-8 BOM at the beginning of CSV', async () => {
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

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.startsWith('\uFEFF')).toBe(true);
    });

    it('should escape commas in CSV fields', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [
          {
            id: 'q1',
            tournamentId: 't1',
            playerId: 'p1',
            group: 'A',
            seeding: 1,
            mp: 3,
            wins: 2,
            ties: 0,
            losses: 1,
            points: 6,
            score: 10,
            player: { id: 'p1', name: 'Player, One', nickname: 'P,1' },
          },
        ],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('"Player, One"');
      expect(result.data).toContain('"P,1"');
    });

    it('should return 404 when tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Tournament not found' });
      expect(result.status).toBe(404);
    });

    it('should return 500 when database operation fails', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to export tournament data' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to export tournament', { error: expect.any(Error), tournamentId: 't1' });
    });

    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/export');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('should handle tournament with all empty data', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Empty Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('TOURNAMENT SUMMARY');
      expect(result.data).toContain('BM Participants');
      expect(result.data).toContain('0');
      expect(result.data).toContain('MR Matches');
      expect(result.data).toContain('GP Matches');
      expect(result.data).toContain('TA Entries');
    });

    it('should sort TT entries by total time ascending', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'e1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 98765,
            rank: 2,
            lives: 0,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'e2',
            playerId: 'p2',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 83456,
            rank: 1,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const player2Index = result.data.indexOf('Player 2');
      const player1Index = result.data.indexOf('Player 1');
      expect(player2Index).toBeGreaterThan(player1Index);
    });

    it('should filter out TT entries with null total time', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [
          {
            id: 'e1',
            playerId: 'p1',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: 83456,
            rank: 1,
            lives: 1,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p1', name: 'Player 1', nickname: 'P1' },
          },
          {
            id: 'e2',
            playerId: 'p2',
            tournamentId: 't1',
            stage: 'qualification',
            totalTime: null,
            rank: null,
            lives: 3,
            createdAt: new Date('2024-01-15'),
            player: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Player 1');
      expect(result.data).not.toContain('Player 2');
    });

    it('should handle uncompleted BM matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 0,
            score2: 0,
            completed: false,
            rounds: [],
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Not started');
      expect(result.data).toContain('No');
    });

    it('should handle uncompleted MR matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            round: 1,
            player1Id: 'p1',
            player2Id: 'p2',
            score1: 0,
            score2: 0,
            completed: false,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        gpMatches: [],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('Not started');
      expect(result.data).toContain('No');
    });

    it('should handle uncompleted GP matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [
          {
            id: 'm1',
            tournamentId: 't1',
            matchNumber: 1,
            stage: 'qualification',
            player1Id: 'p1',
            player2Id: 'p2',
            points1: 0,
            points2: 0,
            completed: false,
            player1: { id: 'p1', name: 'Player 1', nickname: 'P1' },
            player2: { id: 'p2', name: 'Player 2', nickname: 'P2' },
          },
        ],
        ttEntries: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toContain('0');
      expect(result.data).toContain('No');
    });
  });
});
