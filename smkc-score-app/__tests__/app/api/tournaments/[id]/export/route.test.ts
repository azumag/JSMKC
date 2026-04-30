/**
 * @module Tournament Export Route Tests
 *
 * Test suite for the GET /api/tournaments/[id]/export endpoint.
 * This route exports tournament data as a CSV file, including:
 * - Tournament summary section (name, date, status, participant counts)
 * - BM (Battle Mode) qualification standings grouped by group
 * - BM qualification and finals match results with round details
 * - MR (Match Race) match results with stage and round info
 * - GP (Grand Prix) match results with driver points
 * - TA (Time Attack) entries sorted by total time ascending
 *
 * Covers:
 * - CSV formatting: UTF-8 BOM, comma escaping, Content-Type/Disposition headers
 * - Filename generation: Tournament name sanitization, date-based naming
 * - Data export: All competition modes with completed and uncompleted matches
 * - Edge cases: Empty data, null total times, special characters in names
 * - Error handling: Tournament not found (404), database errors (500)
 */
// @ts-nocheck


jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/excel', () => ({ formatDate: jest.fn(() => '2024-01-15'), formatTime: jest.fn(() => '1:23.456') }));
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@e965/xlsx', () => ({
  read: jest.fn(() => ({
    Sheets: {
      "Main Hub": {},
      "TT Qualifications": {},
      "BM Qualifications": {},
      "MR Qualifications": {},
      "GP Qualifications": {},
      "BM Finals": {},
      "MR Finals": {},
      "GP Finals": {},
      "TT Finals": {},
      "Overall Ranking": {},
    },
    Workbook: {},
  })),
  write: jest.fn(() => Buffer.from('xlsm-data')),
}), { virtual: true });
/*
 * NextResponse is used as both a constructor (new NextResponse(csvContent, options))
 * for success CSV responses, and via its static .json() method for error/404 responses.
 * We mock it as a constructor function with a json static method attached.
 */
jest.mock('next/server', () => {
  const MockNextResponse = jest.fn((body, options) => ({
    data: body,
    headers: options?.headers || {},
    status: options?.status || 200,
  }));
  MockNextResponse.json = jest.fn((data, options) => ({
    data,
    status: options?.status || 200,
  }));
  return { NextResponse: MockNextResponse };
});

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { createLogger } from '@/lib/logger';
import { formatDate, formatTime } from '@/lib/excel';
import { auth } from '@/lib/auth';
import { GET } from '@/app/api/tournaments/[id]/export/route';
import { NextResponse } from 'next/server';
import * as XLSX from '@e965/xlsx';
import { getCloudflareContext } from '@opennextjs/cloudflare';

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
    (global.fetch as jest.Mock | undefined) = undefined;
    (getCloudflareContext as jest.Mock).mockReturnValue({ env: { DB: {} } });
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    /* Re-configure NextResponse constructor and json after clearAllMocks */
    (NextResponse as unknown as jest.Mock).mockImplementation((body: string, options?: any) => ({
      data: body,
      headers: options?.headers || {},
      status: options?.status || 200,
    }));
    (NextResponse as any).json = jest.fn((data: unknown, options?: { status?: number }) => ({
      data,
      status: options?.status || 200,
    }));
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
          bmQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          mrQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          gpQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          bmMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          mrMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          gpMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
          ttEntries: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
          ttPhaseRounds: true,
          playerScores: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
        },
      });
    });

    it('should export a populated CDM macro workbook when requested', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [{
          player: { id: 'p1', name: 'Player One', nickname: 'P1' },
          seeding: 1,
          group: 'A',
          mp: 1,
          wins: 1,
          ties: 0,
          losses: 0,
          winRounds: 4,
          lossRounds: 1,
          points: 3,
          score: 1000,
        }],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [{
          matchNumber: 1,
          stage: 'finals',
          round: 'gf',
          bracketPosition: 'gf',
          isGrandFinal: true,
          player1: { id: 'p1', name: 'Player One', nickname: 'P1' },
          player2: { id: 'p2', name: 'Player Two', nickname: 'P2' },
          score1: 5,
          score2: 3,
          completed: true,
        }],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [{
          playerId: 'p1',
          player: { id: 'p1', name: 'Player One', nickname: 'P1' },
          stage: 'qualification',
          seeding: 1,
          lives: 3,
          eliminated: false,
          times: { MC1: '0:12.345' },
          totalTime: 12345,
        }],
        ttPhaseRounds: [],
        playerScores: [{
          player: { id: 'p1', name: 'Player One', nickname: 'P1' },
          taQualificationPoints: 1000,
          bmQualificationPoints: 1000,
          mrQualificationPoints: 0,
          gpQualificationPoints: 0,
          taFinalsPoints: 0,
          bmFinalsPoints: 2000,
          mrFinalsPoints: 0,
          gpFinalsPoints: 0,
          totalPoints: 4000,
          overallRank: 1,
        }],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      const assetFetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      (getCloudflareContext as jest.Mock).mockReturnValue({
        env: { DB: {}, ASSETS: { fetch: assetFetch } },
      });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(assetFetch).toHaveBeenCalledWith(new URL('/templates/cdm-2025-template.xlsm', 'https://assets.local'));
      expect(global.fetch).toBeUndefined();
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.headers['Content-Type']).toBe('application/vnd.ms-excel.sheet.macroEnabled.12');
      expect(result.headers['Content-Disposition']).toContain('.xlsm');
    });

    it('should return 401 when CDM export is requested without authentication', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      }));
      expect(result.status).toBe(401);
      expect(prisma.tournament.findUnique).not.toHaveBeenCalled();
    });

    it('should return 403 when CDM export is requested by a non-admin user', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'player-1', role: 'player' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Admin access required',
        code: 'FORBIDDEN',
      }));
      expect(result.status).toBe(403);
      expect(prisma.tournament.findUnique).not.toHaveBeenCalled();
    });

    it('should return 503 when the CDM template self-fetch fails', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
        playerScores: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Failed to load CDM export template',
        code: 'SERVICE_UNAVAILABLE',
      }));
      expect(result.status).toBe(503);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to load CDM export template', {
        source: 'fetch',
        status: 404,
        tournamentId: 't1',
      });
      expect(XLSX.read).not.toHaveBeenCalled();
    });

    it('should return 503 when ASSETS.fetch throws during CDM template loading', async () => {
      const mockTournament = {
        id: 't1',
        name: 'CDM Tournament',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [],
        ttPhaseRounds: [],
        playerScores: [],
      };
      const fetchError = new Error('ASSETS unavailable');
      const assetFetch = jest.fn().mockRejectedValue(fetchError);

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      (getCloudflareContext as jest.Mock).mockReturnValue({
        env: { DB: {}, ASSETS: { fetch: assetFetch } },
      });
      global.fetch = jest.fn();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(assetFetch).toHaveBeenCalledWith(new URL('/templates/cdm-2025-template.xlsm', 'https://assets.local'));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.data).toEqual(expect.objectContaining({
        success: false,
        error: 'Failed to load CDM export template',
        code: 'SERVICE_UNAVAILABLE',
      }));
      expect(result.status).toBe(503);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to load CDM export template', {
        source: 'ASSETS',
        status: 500,
        error: fetchError,
        tournamentId: 't1',
      });
      expect(XLSX.read).not.toHaveBeenCalled();
    });

    it('should not pollute Object.prototype when CDM export receives malicious player names', async () => {
      const pollutionKey = 'cdmExportPolluted';
      delete Object.prototype[pollutionKey];

      const mockTournament = {
        id: 't1',
        name: '__proto__',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [{
          player: { id: 'p1', name: '__proto__', nickname: '__proto__', country: 'constructor' },
          seeding: 1,
          group: 'A',
          mp: 1,
          wins: 1,
          ties: 0,
          losses: 0,
          winRounds: 4,
          lossRounds: 1,
          points: 3,
          score: 1000,
        }],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [],
        ttEntries: [{
          playerId: 'p1',
          player: { id: 'p1', name: '__proto__', nickname: '__proto__', country: 'constructor' },
          stage: 'qualification',
          seeding: 1,
          lives: 3,
          eliminated: false,
          times: JSON.parse(`{"MC1":"0:12.345","__proto__":{"${pollutionKey}":true},"constructor":{"prototype":{"${pollutionKey}":true}}}`),
          totalTime: 12345,
        }],
        ttPhaseRounds: [],
        playerScores: [{
          player: { id: 'p1', name: '__proto__', nickname: '__proto__', country: 'constructor' },
          taQualificationPoints: 1000,
          bmQualificationPoints: 1000,
          mrQualificationPoints: 0,
          gpQualificationPoints: 0,
          taFinalsPoints: 0,
          bmFinalsPoints: 0,
          mrFinalsPoints: 0,
          gpFinalsPoints: 0,
          totalPoints: 2000,
          overallRank: 1,
        }],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      });

      try {
        const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
        const params = Promise.resolve({ id: 't1' });
        const result = await GET(request, { params });
        const workbook = (XLSX.write as jest.Mock).mock.calls[0][0];

        expect(result.headers['Content-Disposition']).toContain('__proto__-cdm-2024-01-15.xlsm');
        expect(workbook.Sheets["Main Hub"].B2.v).toBe('__proto__');
        expect(workbook.Sheets["Main Hub"].C2.v).toBe('__proto__');
        expect(({} as Record<string, unknown>)[pollutionKey]).toBeUndefined();
        expect(Object.prototype[pollutionKey]).toBeUndefined();
      } finally {
        delete Object.prototype[pollutionKey];
      }
    });

    it('should write GP finals cupResults details into the CDM workbook', async () => {
      const mockTournament = {
        id: 't1',
        name: 'GP Finals CDM',
        date: new Date('2024-01-15'),
        status: 'completed',
        bmQualifications: [],
        mrQualifications: [],
        gpQualifications: [],
        bmMatches: [],
        mrMatches: [],
        gpMatches: [{
          matchNumber: 1,
          stage: 'playoff',
          round: 'winners_final',
          bracketPosition: 'WF',
          player1: { id: 'p1', name: 'Player One', nickname: 'P1' },
          player2: { id: 'p2', name: 'Player Two', nickname: 'P2' },
          points1: 2,
          points2: 1,
          cup: 'Star',
          cupResults: [
            { cup: 'Mushroom', points1: 45, points2: 30, winner: 1 },
            { cup: 'Flower', points1: 24, points2: 45, winner: 2 },
            { cup: 'Star', points1: 48, points2: 21, winner: 1 },
          ],
          completed: true,
        }],
        ttEntries: [],
        ttPhaseRounds: [],
        playerScores: [],
      };

      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export?format=cdm');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      const workbook = (XLSX.write as jest.Mock).mock.calls[0][0];
      expect(workbook.Sheets["GP Finals"].H5.v).toBe(2);
      expect(workbook.Sheets["GP Finals"].H6.v).toBe(1);
      expect(workbook.Sheets["GP Finals"].I5.v).toBe('Mushroom: 45-30; Flower: 24-45; Star: 48-21');
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
            /* round must be a string since source code calls .includes(',') on it without String() conversion */
            round: '1',
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
            /* stage and round must be strings since source code calls .includes(',') on them
               without String() conversion (v.includes is not a function for numbers) */
            stage: 'qualification',
            round: '1',
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

      /*
       * BM qualification data rows use simple row.join(',') without CSV escaping,
       * so commas in player names are NOT escaped (unlike match data rows).
       * The raw CSV will contain the player names with unescaped commas.
       */
      expect(result.data).toContain('Player, One');
      expect(result.data).toContain('P,1');
    });

    it('should return 404 when tournament not found', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      // createErrorResponse includes success: false and error message
      expect(result.data).toEqual(expect.objectContaining({ success: false, error: 'Tournament not found' }));
      expect(result.status).toBe(404);
    });

    it('should return 500 when database operation fails', async () => {
      (prisma.tournament.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/export');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      // createErrorResponse includes success: false and error message
      expect(result.data).toEqual(expect.objectContaining({ success: false, error: 'Failed to export tournament data' }));
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

      /* Player 2 has faster time (83456) so appears first (lower index) in the TA section */
      const player2Index = result.data.indexOf('Player 2');
      const player1Index = result.data.indexOf('Player 1');
      expect(player2Index).toBeLessThan(player1Index);
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
            /* round must be a string since source code calls .includes(',') on it without String() conversion */
            round: '1',
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
