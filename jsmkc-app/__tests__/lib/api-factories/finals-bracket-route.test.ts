/**
 * @module __tests__/lib/api-factories/finals-bracket-route.test.ts
 *
 * Tests for the finals bracket route factory (finals-bracket-route.ts).
 *
 * Covers:
 * GET handler:
 * - Fetches matches with stage='finals' and qualifications with BracketPlayer mapping
 * - Returns totalPlayers count
 * - Correct query ordering (matchNumber asc, score/points desc)
 * - qualifyingRank based on index position
 * - Database error handling (500)
 *
 * POST handler:
 * - Admin authentication (401 for non-admin)
 * - Calls generateDoubleEliminationBracket with correct arguments
 * - Returns 400 when no qualifications exist
 * - Creates audit log and handles audit log failure gracefully
 * - Database error handling (500)
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/tournament/double-elimination', () => ({
  generateDoubleEliminationBracket: jest.fn(),
  BracketPlayer: {},
}));
jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: { CREATE_BRACKET: 'CREATE_BRACKET' },
}));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateDoubleEliminationBracket } from '@/lib/tournament/double-elimination';
import { createAuditLog } from '@/lib/audit-log';
import { createFinalsBracketHandlers } from '@/lib/api-factories/finals-bracket-route';

/** Factory for creating test config */
const createMockConfig = (overrides = {}) => ({
  matchModel: 'bMMatch',
  qualificationModel: 'bMQualification',
  loggerName: 'test-bracket-api',
  eventCode: 'BM' as const,
  ...overrides,
});

/** Admin session mock */
const adminSession = { user: { id: 'admin-1', role: 'admin' } };

/** Factory for qualification records with player data */
const createMockQualifications = (count = 4) =>
  Array.from({ length: count }, (_, i) => ({
    id: `qual-${i}`,
    playerId: `player-${i}`,
    score: 100 - i * 10,
    points: 50 - i * 5,
    player: { id: `player-${i}`, name: `Player ${i + 1}`, nickname: `P${i + 1}` },
  }));

/** Mock finals matches with player data */
const mockMatches = [
  { id: 'm1', matchNumber: 1, stage: 'finals', player1: { id: 'p1' }, player2: { id: 'p2' } },
  { id: 'm2', matchNumber: 2, stage: 'finals', player1: { id: 'p3' }, player2: { id: 'p4' } },
];

/** Mock bracket result returned by generateDoubleEliminationBracket */
const mockBracketResult = {
  winnerBracket: [{ round: 1, matches: [] }],
  loserBracket: [{ round: 1, matches: [] }],
  grandFinal: { match: null },
};

describe('Finals Bracket Route Factory', () => {
  const config = createMockConfig();
  const { GET, POST } = createFinalsBracketHandlers(config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // === GET HANDLER ===

  describe('GET handler', () => {
    // Success: Returns matches and players with qualifyingRank
    it('should return matches and players with qualifyingRank', async () => {
      const quals = createMockQualifications(4);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(quals);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.matches).toEqual(mockMatches);
      // Players should be mapped with qualifyingRank based on position
      expect(json.players[0].qualifyingRank).toBe(1);
      expect(json.players[1].qualifyingRank).toBe(2);
      expect(json.players[3].qualifyingRank).toBe(4);
    });

    // Success: Returns totalPlayers count
    it('should return totalPlayers count', async () => {
      const quals = createMockQualifications(8);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(quals);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      const json = await response.json();
      expect(json.totalPlayers).toBe(8);
    });

    // Query: Matches queried with stage='finals', ordered by matchNumber asc
    it('should query matches with stage finals and order by matchNumber', async () => {
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Mapping: Players include BracketPlayer fields
    it('should map qualifications to BracketPlayer with correct fields', async () => {
      const quals = createMockQualifications(2);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(quals);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      const json = await response.json();
      expect(json.players[0]).toEqual({
        playerId: 'player-0',
        playerName: 'Player 1',
        playerNickname: 'P1',
        qualifyingRank: 1,
        losses: 0,
        points: 50,
      });
    });

    // Error: Returns 500 on database failure
    it('should return 500 on database failure', async () => {
      (prisma.bMMatch.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket');
      const params = Promise.resolve({ id: 't1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to fetch bracket');
    });
  });

  // === POST HANDLER ===

  describe('POST handler', () => {
    // Auth: Returns 401 when not authenticated
    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await POST(request, { params });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('Unauthorized: Admin access required');
    });

    // Auth: Returns 401 when not admin
    it('should return 401 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'member' } });

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await POST(request, { params });

      expect(response.status).toBe(401);
    });

    // Success: Generates bracket with admin auth
    it('should generate bracket successfully with admin auth', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const quals = createMockQualifications(8);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(quals);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracketResult);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
        headers: { 'user-agent': 'TestAgent' },
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.winnerBracket).toEqual(mockBracketResult.winnerBracket);
      expect(json.loserBracket).toEqual(mockBracketResult.loserBracket);
      expect(json.grandFinal).toEqual(mockBracketResult.grandFinal);
      expect(json.totalPlayers).toBe(8);
    });

    // Validation: Returns 400 when no qualifications exist
    it('should return 400 when no qualifications exist', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await POST(request, { params });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('No qualification results found');
    });

    // Bracket gen: Calls generateDoubleEliminationBracket with players and eventCode
    it('should call generateDoubleEliminationBracket with correct arguments', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const quals = createMockQualifications(4);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(quals);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracketResult);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
      });
      const params = Promise.resolve({ id: 't1' });
      await POST(request, { params });

      expect(generateDoubleEliminationBracket).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ playerId: 'player-0', qualifyingRank: 1 }),
        ]),
        'BM',
      );
    });

    // Audit resilience: Succeeds even when audit log fails
    it('should succeed even when audit log creation fails', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      const quals = createMockQualifications(4);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(quals);
      (generateDoubleEliminationBracket as jest.Mock).mockReturnValue(mockBracketResult);
      // Audit log throws but should not break the main flow
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
        headers: { 'user-agent': 'TestAgent' },
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await POST(request, { params });

      // Should still return 200 despite audit log failure
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.totalPlayers).toBe(4);
    });

    // Error: Returns 500 on database failure
    it('should return 500 on database failure', async () => {
      (auth as jest.Mock).mockResolvedValue(adminSession);
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/bracket', {
        method: 'POST',
      });
      const params = Promise.resolve({ id: 't1' });
      const response = await POST(request, { params });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to generate bracket');
    });
  });
});
