/**
 * @module BM Export API Route Tests
 *
 * Test suite for the Battle Mode CSV export endpoint: /api/tournaments/[id]/bm/export
 *
 * This file covers the GET method which exports tournament BM data (qualifications and matches)
 * as a downloadable CSV file with UTF-8 BOM for Excel compatibility.
 *
 * Key behaviors tested:
 *   - Successful CSV export with qualifications and matches data
 *   - Correct data ordering: qualifications by score/points descending, matches by matchNumber ascending
 *   - CSV filename generation with tournament name and timestamp
 *   - Empty data handling (no qualifications or matches)
 *   - CSV field formatting: qualification fields (Rank, Player Name, Nickname, Matches, Wins,
 *     Ties, Losses, Win Rounds, Loss Rounds, Points, Score) and match fields (Match #, Stage,
 *     Player 1, Player 2, Score 1, Score 2, Completed)
 *   - Player name and nickname inclusion in match export
 *   - Completed status formatting as Yes/No
 *   - Tournament not found (404) handling
 *   - Database error handling for tournament, qualification, and match queries
 *   - Invalid tournament ID handling
 *   - UTF-8 BOM inclusion for CSV encoding compatibility
 *   - Correct Content-Type and Content-Disposition headers for file download
 */
// @ts-nocheck


jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/excel', () => ({ createCSV: jest.fn(() => 'csv,header1,header2\nrow1col1,row1col2') }));
jest.mock('next/server', () => {
  /**
   * Mock NextResponse constructor for CSV export (new NextResponse(body, { headers }))
   * and NextResponse.json for JSON error responses.
   */
  const MockNextResponse = function(body: any, init?: any) {
    return { data: body, headers: init?.headers || {}, status: init?.status || 200 };
  };
  MockNextResponse.json = jest.fn();
  return { NextResponse: MockNextResponse };
});

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { createCSV } from '@/lib/excel';
import { GET } from '@/app/api/tournaments/[id]/bm/export/route';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: jest.Mock & { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  constructor(private url: string) {}
  headers = {
    get: (key: string) => undefined,
  };
}

describe('BM Export API Route - /api/tournaments/[id]/bm/export', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    NextResponseMock.NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
  });

  describe('GET - Export BM tournament data as CSV', () => {
    // Success case - Exports tournament data with qualifications and matches
    it('should export BM tournament data as CSV with BOM for UTF-8', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-15'),
      };

      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          score: 6,
          points: 10,
          mp: 3,
          wins: 2,
          ties: 1,
          losses: 0,
          winRounds: 8,
          lossRounds: 4,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'P1',
          },
        },
        {
          id: 'q2',
          tournamentId: 't1',
          playerId: 'p2',
          group: 'A',
          score: 4,
          points: 6,
          mp: 3,
          wins: 1,
          ties: 1,
          losses: 1,
          winRounds: 5,
          lossRounds: 6,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'P2',
          },
        },
      ];

      const mockMatches = [
        {
          id: 'm1',
          tournamentId: 't1',
          matchNumber: 1,
          stage: 'qualification',
          score1: 3,
          score2: 1,
          completed: true,
          player1: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'P1',
          },
          player2: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'P2',
          },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValueOnce('csv,header1,header2\nrow1col1,row1col2').mockReturnValueOnce('csv,matchHeader1,matchHeader2\nmatchRow1col1,matchRow1col2');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toBeDefined();
      expect(result.data.startsWith('\uFEFF')).toBe(true);
      expect(result.data).toContain('QUALIFICATIONS');
      expect(result.data).toContain('MATCHES');
      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: 't1' },
        select: { name: true, date: true },
      });
      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [
          { score: 'desc' },
          { points: 'desc' },
        ],
      });
      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
      expect(createCSV).toHaveBeenCalledTimes(2);
    });

    // Success case - Exports data sorted by score and points
    it('should export qualifications sorted by score (desc) then points (desc)', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      const mockQualifications = [
        { playerId: 'p1', score: 10, points: 20, player: { name: 'Player 1', nickname: 'P1' } },
        { playerId: 'p2', score: 10, points: 18, player: { name: 'Player 2', nickname: 'P2' } },
        { playerId: 'p3', score: 9, points: 20, player: { name: 'Player 3', nickname: 'P3' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [
          { score: 'desc' },
          { points: 'desc' },
        ],
      });
    });

    // Success case - Exports matches ordered by match number
    it('should export matches ordered by match number ascending', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      const mockMatches = [
        { matchNumber: 3, player1: { name: 'P1', nickname: 'P1' }, player2: { name: 'P2', nickname: 'P2' } },
        { matchNumber: 1, player1: { name: 'P1', nickname: 'P1' }, player2: { name: 'P2', nickname: 'P2' } },
        { matchNumber: 2, player1: { name: 'P1', nickname: 'P1' }, player2: { name: 'P2', nickname: 'P2' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Generates filename with tournament name and timestamp
    it('should generate CSV filename with tournament name and timestamp', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament 2024',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers).toBeDefined();
      expect(result.headers['Content-Disposition']).toContain('Test Tournament 2024_BM_');
      expect(result.headers['Content-Disposition']).toContain('.csv');
      expect(result.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    });

    // Success case - Handles empty data gracefully
    it('should handle empty qualifications and matches data', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,header\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toBeDefined();
      expect(result.data).toContain('QUALIFICATIONS');
      expect(result.data).toContain('MATCHES');
    });

    // Success case - Formats qualification data correctly in CSV
    it('should format qualification data with all required fields', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      const mockQualifications = [
        {
          playerId: 'p1',
          score: 6,
          points: 10,
          mp: 3,
          wins: 2,
          ties: 1,
          losses: 0,
          winRounds: 8,
          lossRounds: 4,
          player: { name: 'Player 1', nickname: 'P1' },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const qualCall = (createCSV as jest.Mock).mock.calls[0];
      const headers = qualCall[0];
      expect(headers).toContain('Rank');
      expect(headers).toContain('Player Name');
      expect(headers).toContain('Nickname');
      expect(headers).toContain('Matches');
      expect(headers).toContain('Wins');
      expect(headers).toContain('Ties');
      expect(headers).toContain('Losses');
      expect(headers).toContain('Win Rounds');
      expect(headers).toContain('Loss Rounds');
      expect(headers).toContain('Points');
      expect(headers).toContain('Score');
    });

    // Success case - Formats match data correctly in CSV
    it('should format match data with all required fields', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      const mockMatches = [
        {
          matchNumber: 1,
          stage: 'qualification',
          score1: 3,
          score2: 1,
          completed: true,
          player1: { name: 'Player 1', nickname: 'P1' },
          player2: { name: 'Player 2', nickname: 'P2' },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const matchCall = (createCSV as jest.Mock).mock.calls[1];
      const headers = matchCall[0];
      expect(headers).toContain('Match #');
      expect(headers).toContain('Stage');
      expect(headers).toContain('Player 1');
      expect(headers).toContain('Player 2');
      expect(headers).toContain('Score 1');
      expect(headers).toContain('Score 2');
      expect(headers).toContain('Completed');
    });

    // Success case - Includes player name and nickname in match data
    it('should include player name and nickname in match export', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      const mockMatches = [
        {
          matchNumber: 1,
          stage: 'qualification',
          player1: { name: 'Player 1', nickname: 'P1' },
          player2: { name: 'Player 2', nickname: 'P2' },
        },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const matchCall = (createCSV as jest.Mock).mock.calls[1];
      const data = matchCall[1];
      expect(data[0][2]).toContain('Player 1');
      expect(data[0][2]).toContain('P1');
      expect(data[0][3]).toContain('Player 2');
      expect(data[0][3]).toContain('P2');
    });

    // Success case - Formats completed status as Yes/No
    it('should format completed status as Yes or No in CSV', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      const mockMatches = [
        { matchNumber: 1, completed: true, player1: { name: 'P1', nickname: 'P1' }, player2: { name: 'P2', nickname: 'P2' } },
        { matchNumber: 2, completed: false, player1: { name: 'P1', nickname: 'P1' }, player2: { name: 'P2', nickname: 'P2' } },
      ];

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const matchCall = (createCSV as jest.Mock).mock.calls[1];
      const data = matchCall[1];
      expect(data[0][6]).toBe('Yes');
      expect(data[1][6]).toBe('No');
    });

    // Not found case - Returns 404 when tournament not found
    it('should return 404 when tournament is not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Tournament not found' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database query fails', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to export tournament' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to export tournament', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Error case - Returns 500 when qualification query fails
    it('should return 500 when qualification query fails', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to export tournament' });
      expect(result.status).toBe(500);
    });

    // Error case - Returns 500 when matches query fails
    it('should return 500 when matches query fails', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to export tournament' });
      expect(result.status).toBe(500);
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/bm/export');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    // Edge case - CSV includes BOM for UTF-8 compatibility
    it('should include UTF-8 BOM at the beginning of CSV content', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      const bom = '\uFEFF';
      expect(result.data.startsWith(bom)).toBe(true);
    });

    // Edge case - Content-Type header is set correctly
    it('should set correct Content-Type header for CSV download', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    });

    // Edge case - Content-Disposition header is set correctly
    it('should set correct Content-Disposition header for file download', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-15'),
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (createCSV as jest.Mock).mockReturnValue('csv,data\n');

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.headers['Content-Disposition']).toContain('attachment');
      expect(result.headers['Content-Disposition']).toContain('.csv');
    });
  });
});
