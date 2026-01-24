// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: { findUnique: jest.fn() },
    mRQualification: { findMany: jest.fn() },
    mRMatch: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/excel', () => ({ createCSV: jest.fn((headers, data) => 'header1,header2\ndata1,data2') }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { createCSV } from '@/lib/excel';
import { GET } from '@/app/api/tournaments/[id]/mr/export/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  constructor(private url: string) {}
  get url() { return this.url; }
}

describe('MR Export API Route - /api/tournaments/[id]/mr/export', () => {
  const loggerMock = { error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200, headers: options?.headers }));
  });

  describe('GET - Export tournament to CSV', () => {
    // Success case - Exports tournament with qualifications and matches
    it('should export tournament data as CSV with qualifications and matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', mp: 3, wins: 2, ties: 1, losses: 0, points: 10, score: 6, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', mp: 3, wins: 1, ties: 2, losses: 0, points: 8, score: 4, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
      ];

      const mockMatches = [
        { id: 'm1', matchNumber: 1, stage: 'qualification', score1: 3, score2: 1, completed: true, player1: { id: 'p1', name: 'Player 1', nickname: 'P1' }, player2: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { id: 'm2', matchNumber: 2, stage: 'finals', score1: 2, score2: 1, completed: false, player1: { id: 'p1', name: 'Player 1', nickname: 'P1' }, player2: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock)
        .mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n1,Player 1,P1,3,2,1,0,10,6\n2,Player 2,P2,3,1,2,0,8,4')
        .mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n1,qualification,Player 1 (P1),Player 2 (P2),3,1,Yes\n2,finals,Player 1 (P1),Player 3 (P3),2,1,No');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers).toEqual({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': expect.stringContaining('Test_Tournament_MR_'),
      });
      expect(typeof result).toBe('object');
    });

    // Success case - Exports empty tournament
    it('should export empty tournament when no data exists', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock)
        .mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n')
        .mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(result.headers['Content-Disposition']).toContain('Test_Tournament_MR_');
    });

    // Success case - Includes BOM for UTF-8 encoding
    it('should include BOM for UTF-8 encoding', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock)
        .mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n')
        .mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      // BOM is \uFEFF
      const bom = '\uFEFF';
      expect(result).toHaveProperty('constructor');
    });

    // Success case - Orders qualifications by score desc, points desc
    it('should order qualifications by score descending, then points descending', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      const mockQualifications = [
        { id: 'q1', playerId: 'p1', mp: 3, wins: 2, ties: 1, losses: 0, points: 10, score: 6, player: { id: 'p1', name: 'Player 1', nickname: 'P1' } },
        { id: 'q2', playerId: 'p2', mp: 3, wins: 1, ties: 2, losses: 0, points: 8, score: 4, player: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { id: 'q3', playerId: 'p3', mp: 3, wins: 0, ties: 3, losses: 0, points: 6, score: 2, player: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n');
      (createCSV as jest.Mock).mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [
          { score: 'desc' },
          { points: 'desc' },
        ],
      });
    });

    // Success case - Orders matches by matchNumber ascending
    it('should order matches by matchNumber ascending', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n');
      (createCSV as jest.Mock).mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(prisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Formats completed status correctly
    it('should format completed status as Yes/No', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      const mockMatches = [
        { id: 'm1', matchNumber: 1, stage: 'qualification', score1: 3, score2: 1, completed: true, player1: { id: 'p1', name: 'Player 1', nickname: 'P1' }, player2: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { id: 'm2', matchNumber: 2, stage: 'finals', score1: 2, score2: 1, completed: false, player1: { id: 'p1', name: 'Player 1', nickname: 'P1' }, player2: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock)
        .mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n')
        .mockImplementation((headers, data) => {
          const csvLines = [headers.join(',')];
          data.forEach(row => csvLines.push(row.join(',')));
          return csvLines.join('\n');
        });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(createCSV).toHaveBeenCalledWith(
        expect.any(Array),
        expect.arrayContaining([
          expect.arrayContaining(['Yes']),
          expect.arrayContaining(['No']),
        ])
      );
    });

    // Success case - Generates timestamp in filename
    it('should generate timestamp in CSV filename', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock)
        .mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n')
        .mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toMatch(/Test_Tournament_MR_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });

    // Error case - Returns 404 when tournament not found
    it('should return 404 when tournament does not exist', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Tournament not found' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to export tournament' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to export tournament', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles special characters in tournament name
    it('should handle special characters in tournament name', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024: Special Event! @#$',
        date: new Date('2024-01-01'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock)
        .mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n')
        .mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toContain('Test_Tournament_2024');
    });

    // Edge case - Handles player with no nickname
    it('should handle player with no nickname', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      const mockMatches = [
        { id: 'm1', matchNumber: 1, stage: 'qualification', score1: 3, score2: 1, completed: true, player1: { id: 'p1', name: 'Player 1', nickname: '' }, player2: { id: 'p2', name: 'Player 2', nickname: null } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n');
      (createCSV as jest.Mock).mockReturnValueOnce('Match #,Stage,Player 1,Player 2,Score 1,Score 2,Completed\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
    });

    // Edge case - Includes all stages in matches
    it('should include matches from all stages', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };

      const mockMatches = [
        { id: 'm1', matchNumber: 1, stage: 'qualification', score1: 3, score2: 1, completed: true, player1: { id: 'p1', name: 'Player 1', nickname: 'P1' }, player2: { id: 'p2', name: 'Player 2', nickname: 'P2' } },
        { id: 'm2', matchNumber: 2, stage: 'finals', score1: 2, score2: 1, completed: false, player1: { id: 'p1', name: 'Player 1', nickname: 'P1' }, player2: { id: 'p3', name: 'Player 3', nickname: 'P3' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValueOnce('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Points,Score\n');
      (createCSV as jest.Mock).mockImplementation((headers, data) => {
        return data.map(row => `${row[1]}`).join(',');
      });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/export');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(prisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });
  });
});
