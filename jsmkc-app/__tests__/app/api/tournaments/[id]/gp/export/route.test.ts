// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    tournament: { findUnique: jest.fn() },
    gPQualification: { findMany: jest.fn() },
    gPMatch: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/excel', () => ({
  createCSV: jest.fn((headers, data) => {
    const headerRow = headers.join(',');
    const dataRows = data.map(row => row.join(',')).join('\n');
    return `${headerRow}\n${dataRows}`;
  }),
}));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: jest.fn() }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { GET } from '@/app/api/tournaments/[id]/gp/export/route';
import { NextResponse } from 'next/server';

describe('GP Export API Route - /api/tournaments/[id]/gp/export', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
  });

  describe('GET - Export grand prix data as CSV', () => {
    // Success case - Returns CSV with qualifications and matches
    it('should return CSV file with qualifications and matches', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      const mockQualifications = [
        {
          id: 'q1',
          tournamentId: 't1',
          playerId: 'p1',
          group: 'A',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'nick1',
          },
        },
        {
          id: 'q2',
          tournamentId: 't1',
          playerId: 'p2',
          group: 'A',
          mp: 4,
          wins: 2,
          ties: 1,
          losses: 1,
          points: 30,
          score: 5,
          player: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'nick2',
          },
        },
      ];
      
      const mockMatches = [
        {
          id: 'm1',
          tournamentId: 't1',
          matchNumber: 1,
          stage: 'qualification',
          cup: 'Mushroom Cup',
          points1: 18,
          points2: 6,
          completed: true,
          player1: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'nick1',
          },
          player2: {
            id: 'p2',
            name: 'Player 2',
            nickname: 'nick2',
          },
        },
        {
          id: 'm2',
          tournamentId: 't1',
          matchNumber: 2,
          stage: 'finals',
          cup: null,
          points1: 3,
          points2: 1,
          completed: false,
          player1: {
            id: 'p3',
            name: 'Player 3',
            nickname: 'nick3',
          },
          player2: {
            id: 'p4',
            name: 'Player 4',
            nickname: 'nick4',
          },
        },
      ];
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      
      const mockResponse = {
        body: 'CSV_CONTENT',
        headers: new Map([
          ['Content-Type', 'text/csv; charset=utf-8'],
          ['Content-Disposition', 'attachment; filename="Test_Tournament_GP_2024-01-01.csv"'],
        ]),
      };
      (NextResponse as jest.Mock).mockReturnValue(mockResponse);
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });
      
      expect(NextResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': expect.stringContaining('Test_Tournament_GP_'),
          }),
        })
      );
    });

    // Success case - Generates correct CSV content with BOM
    it('should generate correct CSV content with UTF-8 BOM', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: 'CSV_CONTENT', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body.startsWith('\uFEFF')).toBe(true);
      expect(result.body.includes('QUALIFICATIONS')).toBe(true);
      expect(result.body.includes('MATCHES')).toBe(true);
    });

    // Success case - Includes BOM for UTF-8 compatibility
    it('should include BOM for UTF-8 compatibility in Excel', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body).toEqual('\uFEFFQUALIFICATIONS\nRank,Player Name,Nickname,Matches,Wins,Ties,Losses,Driver Points,Score\n\nMATCHES\nMatch #,Stage,Cup,Player 1,Player 2,Points 1,Points 2,Completed\n');
    });

    // Success case - Generates correct qualification headers
    it('should generate correct qualification headers and data', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      const mockQualifications = [
        {
          id: 'q1',
          mp: 4,
          wins: 3,
          ties: 0,
          losses: 1,
          points: 36,
          score: 6,
          player: { name: 'Player 1', nickname: 'nick1' },
        },
      ];
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body).toContain('Rank,Player Name,Nickname,Matches,Wins,Ties,Losses,Driver Points,Score');
      expect(result.body).toContain('1,Player 1,nick1,4,3,0,1,36,6');
    });

    // Success case - Generates correct match headers
    it('should generate correct match headers and data', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      const mockMatches = [
        {
          matchNumber: 1,
          stage: 'qualification',
          cup: 'Mushroom Cup',
          points1: 18,
          points2: 6,
          completed: true,
          player1: { name: 'Player 1', nickname: 'nick1' },
          player2: { name: 'Player 2', nickname: 'nick2' },
        },
      ];
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body).toContain('Match #,Stage,Cup,Player 1,Player 2,Points 1,Points 2,Completed');
      expect(result.body).toContain('1,qualification,Mushroom Cup,Player 1 (nick1),Player 2 (nick2),18,6,Yes');
    });

    // Success case - Handles matches without cup
    it('should handle matches without cup (shows dash)', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      const mockMatches = [
        {
          matchNumber: 1,
          stage: 'finals',
          cup: null,
          points1: 3,
          points2: 1,
          completed: false,
          player1: { name: 'Player 1', nickname: 'nick1' },
          player2: { name: 'Player 2', nickname: 'nick2' },
        },
      ];
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body).toContain('1,finals,-,Player 1 (nick1),Player 2 (nick2),3,1,No');
    });

    // Success case - Correctly sorts qualifications by score then points
    it('should correctly sort qualifications by score then points', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      const mockQualifications = [
        {
          id: 'q1',
          score: 4,
          points: 24,
          player: { name: 'Player 4', nickname: 'nick4' },
        },
        {
          id: 'q2',
          score: 6,
          points: 30,
          player: { name: 'Player 1', nickname: 'nick1' },
        },
        {
          id: 'q3',
          score: 6,
          points: 36,
          player: { name: 'Player 2', nickname: 'nick2' },
        },
      ];
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      const lines = result.body.split('\n');
      const qualSection = lines.slice(1, lines.indexOf('MATCHES')).join('\n');
      expect(qualSection).toContain('1,Player 2,nick2');
      expect(qualSection).toContain('2,Player 1,nick1');
      expect(qualSection).toContain('3,Player 4,nick4');
    });

    // Success case - Correctly sorts matches by match number
    it('should correctly sort matches by match number', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      const mockMatches = [
        {
          matchNumber: 3,
          stage: 'qualification',
          cup: 'Mushroom Cup',
          points1: 18,
          points2: 6,
          completed: true,
          player1: { name: 'Player 3', nickname: 'nick3' },
          player2: { name: 'Player 4', nickname: 'nick4' },
        },
        {
          matchNumber: 1,
          stage: 'qualification',
          cup: 'Mushroom Cup',
          points1: 18,
          points2: 6,
          completed: true,
          player1: { name: 'Player 1', nickname: 'nick1' },
          player2: { name: 'Player 2', nickname: 'nick2' },
        },
        {
          matchNumber: 2,
          stage: 'qualification',
          cup: 'Mushroom Cup',
          points1: 18,
          points2: 6,
          completed: true,
          player1: { name: 'Player 5', nickname: 'nick5' },
          player2: { name: 'Player 6', nickname: 'nick6' },
        },
      ];
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      const matchSection = result.body.substring(result.body.indexOf('MATCHES'));
      const matchLines = matchSection.split('\n').filter((line: string) => line.trim() && !line.startsWith('MATCH'));
      
      expect(matchLines[1]).toContain('1,qualification');
      expect(matchLines[2]).toContain('2,qualification');
      expect(matchLines[3]).toContain('3,qualification');
    });

    // Success case - Generates correct filename with timestamp
    it('should generate correct filename with timestamp', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.headers.get('Content-Disposition')).toMatch(/attachment; filename="Test_Tournament_GP_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.csv"/);
    });

    // Not found case - Returns 404 when tournament is not found
    it('should return 404 when tournament is not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/nonexistent/gp/export');
      const params = Promise.resolve({ id: 'nonexistent' });
      const result = await GET(request, { params });
      
      expect(result.body).toEqual(JSON.stringify({ error: 'Tournament not found' }));
      expect(result.headers.get('Content-Type')).toBe('application/json');
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body).toEqual(JSON.stringify({ error: 'Failed to export tournament' }));
      expect(result.headers.get('Content-Type')).toBe('application/json');
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to export tournament', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles tournament with special characters in name
    it('should handle tournament with special characters in name', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Tournament 2024: "Grand Prix" (Summer)',
        date: new Date('2024-01-01'),
      };
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.headers.get('Content-Disposition')).toContain('Tournament');
    });

    // Edge case - Handles empty qualifications and matches
    it('should handle empty qualifications and matches gracefully', async () => {
      const mockTournament = {
        id: 't1',
        name: 'Test Tournament',
        date: new Date('2024-01-01'),
      };
      
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      
      const mockResponse = { body: '', headers: new Map() };
      (NextResponse as jest.Mock).mockImplementation((content, options) => {
        mockResponse.body = content;
        mockResponse.headers = new Map(Object.entries(options?.headers || {}));
        return mockResponse;
      });
      
      const request = new Request('http://localhost:3000/api/tournaments/t1/gp/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.body).toContain('QUALIFICATIONS\nRank,Player Name,Nickname,Matches,Wins,Ties,Losses,Driver Points,Score\n');
      expect(result.body).toContain('MATCHES\nMatch #,Stage,Cup,Player 1,Player 2,Points 1,Points 2,Completed\n');
    });
  });
});
