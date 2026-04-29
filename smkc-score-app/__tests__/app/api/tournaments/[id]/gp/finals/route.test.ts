/**
 * @module GP Finals API Route Tests - /api/tournaments/[id]/gp/finals
 *
 * Test suite for the Grand Prix finals bracket endpoint. The finals phase
 * uses a double-elimination bracket structure where the top 8 qualified
 * players compete in winners/losers brackets with a grand final (and
 * optional reset match).
 *
 * Covers:
 * - GET: Fetching finals matches with bracket structure and round names,
 *   pagination support, and error handling.
 * - POST: Creating the finals bracket from top 8 qualified players,
 *   validation for exactly 8 players, and bracket structure generation.
 * - PUT: Updating finals match scores with winner/loser advancement,
 *   grand final logic (winners bracket player wins outright, losers bracket
 *   player triggers reset match), grand final reset completion, best-of-5
 *   validation, and loser bracket placement.
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/double-elimination', () => ({
  generateBracketStructure: jest.fn(),
  generatePlayoffStructure: jest.fn(() => []),
  roundNames: {
    winners_qf: 'Winners Quarter Finals',
    winners_sf: 'Winners Semi Finals',
    winners_final: 'Winners Final',
    losers_r1: 'Losers Round 1',
    losers_r2: 'Losers Round 2',
    losers_final: 'Losers Final',
    grand_final: 'Grand Final',
    grand_final_reset: 'Grand Final Reset',
  },
}));
jest.mock('@/lib/pagination', () => ({
  paginate: jest.fn(),
}));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));
jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((input: unknown) => input),
}));
/* Mock qualification-confirmed-check: finals-route gates POST/PUT before the
 * handler runs. Return null (= not locked). */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/gp/finals/route';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { paginate } from '@/lib/pagination';
import { configureNextResponseMock } from '../../../../../../helpers/next-response-mock';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };
const jsonMock = NextResponseMock.NextResponse.json;

class MockNextRequest {
  private _headers: Map<string, string>;

  constructor(
    private url: string,
    private body?: any,
    headers?: Map<string, string>
  ) {
    this._headers = headers || new Map();
  }
  async json() { return this.body; }
  get header() { return { get: (key: string) => this._headers.get(key) }; }
  headers = {
    get: (key: string) => this._headers.get(key)
  };
}

describe('GP Finals API Route - /api/tournaments/[id]/gp/finals', () => {
  // Logger mock instance captured in beforeEach - same object returned by createLogger()
  const logger = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.findFirst as jest.Mock).mockImplementation((args: any) => Promise.resolve({ id: args?.where?.OR?.[0]?.id ?? 't1', gpQualificationConfirmed: false }));
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
    configureNextResponseMock(jest.requireMock('next/server').NextResponse);
    (createLogger as jest.Mock).mockReturnValue(logger);
    /* finals-route defensive tournament existence check */
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    /* Patch in missing gPMatch members used by PUT bracket advancement. */

    const gpMatch = prisma.gPMatch as any;
    if (!gpMatch.count) gpMatch.count = jest.fn();
    if (!gpMatch.findFirst) gpMatch.findFirst = jest.fn();
    if (!gpMatch.createMany) gpMatch.createMany = jest.fn();
    gpMatch.count.mockResolvedValue(17);
    gpMatch.findFirst.mockResolvedValue(null);
    gpMatch.createMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET - Fetch grand prix finals data', () => {
    // Success case - Returns finals matches with bracket structure
    it('should return finals matches and bracket structure', async () => {
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'finals', round: 'winners_qf', player1: { id: 'p1' }, player2: { id: 'p2' } },
      ];
      const mockBracket = [
        { matchNumber: 1, round: 'winners_qf', player1Seed: 1, player2Seed: 8 },
      ];
      const mockPaginatedResult = {
        data: mockMatches,
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);
      /* Playoff findMany query must return empty array for non-playoff tests */
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        ...mockPaginatedResult,
        bracketStructure: mockBracket,
        bracketSize: expect.any(Number),
        roundNames,
        phase: 'finals',
        playoffMatches: [],
        playoffStructure: [],
        playoffSeededPlayers: [],
        playoffComplete: false,
        qualificationConfirmed: false,
      });
      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        { findMany: expect.any(Function), count: expect.any(Function) },
        { tournamentId: 't1', stage: 'finals' },
        { matchNumber: 'asc' },
        { page: 1, limit: 50, include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } }
      );
      expect(generateBracketStructure).toHaveBeenCalledWith(8);
    });

    // Success case - Returns empty bracket when no matches exist
    it('should return empty bracket when no matches exist', async () => {
      const mockPaginatedResult = {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      };

      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      (generateBracketStructure as jest.Mock).mockReturnValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.bracketStructure).toEqual([]);
      expect(result.status).toBe(200);
    });

    // Success case - Uses custom pagination parameters
    it('should use custom page and limit parameters when provided', async () => {
      const mockPaginatedResult = {
        data: [],
        meta: { page: 2, limit: 20, total: 0, totalPages: 0 },
      };

      (paginate as jest.Mock).mockResolvedValue(mockPaginatedResult);
      (generateBracketStructure as jest.Mock).mockReturnValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals?page=2&limit=20');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(paginate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        { page: 2, limit: 20, include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } }
      );
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (paginate as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch grand prix finals data', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith('Failed to fetch grand prix finals data', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (paginate as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/gp/finals');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(logger.error).toHaveBeenCalled();
    });

    /**
     * Cup-per-round normalizer: when legacy playoff rows have divergent cups
     * within a single round (e.g. M1=Flower, M2=Star, M3/M4=null — possible
     * from PR #583's old client-side random fallback), GET must converge
     * them to one canonical cup per round via updateMany. Regression guard
     * for PR #585: make sure every match in the same round shares one cup.
     */
    it('should force every playoff match in a round to the same cup', async () => {
      const mixedRoundMatches = [
        { id: 'pm1', matchNumber: 1, round: 'playoff_r1', cup: 'Flower', player1: {}, player2: {} },
        { id: 'pm2', matchNumber: 2, round: 'playoff_r1', cup: 'Star',   player1: {}, player2: {} },
        { id: 'pm3', matchNumber: 3, round: 'playoff_r1', cup: null,     player1: {}, player2: {} },
        { id: 'pm4', matchNumber: 4, round: 'playoff_r1', cup: 'Flower', player1: {}, player2: {} },
      ];
      /* 1st findMany: playoff fetch (returns mixed state). The route now
       * patches `playoffMatches` in memory using the canonical map returned
       * by `normalizeRoundCupsToSingleCup`, so there is no second findMany
       * for the same playoff rows.
       * 2nd findMany: finals legacy-detection scan (empty — no finals rows). */
      (prisma.gPMatch.findMany as jest.Mock)
        .mockResolvedValueOnce(mixedRoundMatches)
        .mockResolvedValueOnce([]);

      (prisma.gPMatch as any).updateMany = jest.fn().mockResolvedValue({ count: 3 });

      (paginate as jest.Mock).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
      });
      (generateBracketStructure as jest.Mock).mockReturnValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      /* updateMany called once per round that needed repair. 'Flower' is the
       * dominant cup (2 occurrences) so it wins over Star (1) and null. The
       * NOT filter avoids touching rows that already match. */

      const updateManyMock = (prisma.gPMatch as any).updateMany as jest.Mock;
      expect(updateManyMock).toHaveBeenCalledWith({
        where: {
          tournamentId: 't1',
          stage: 'playoff',
          round: 'playoff_r1',
          NOT: { cup: 'Flower' },
        },
        data: { cup: 'Flower' },
      });
    });

    /**
     * When a round has every match at cup=null, the normalizer still picks
     * one cup for the whole round (from the shuffled CUPS list) and applies
     * it to all four matches — guaranteeing M1=M2=M3=M4.
     */
    it('should assign one cup to an entirely null-cup round', async () => {
      const nullRoundMatches = [1, 2, 3, 4].map((n) => ({
        id: `pm${n}`,
        matchNumber: n,
        round: 'playoff_r1',
        cup: null,
        player1: {},
        player2: {},
      }));
      // playoff fetch + legacy finals scan (no second playoff fetch — the route
      // now relies on the in-memory canonical map from the normalizer)
      (prisma.gPMatch.findMany as jest.Mock)
        .mockResolvedValueOnce(nullRoundMatches)
        .mockResolvedValueOnce([]);

      (prisma.gPMatch as any).updateMany = jest.fn().mockResolvedValue({ count: 4 });

      (paginate as jest.Mock).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
      });
      (generateBracketStructure as jest.Mock).mockReturnValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);

      const updateManyMock = (prisma.gPMatch as any).updateMany as jest.Mock;
      expect(updateManyMock).toHaveBeenCalledTimes(1);
      const call = updateManyMock.mock.calls[0][0];
      expect(call.where).toMatchObject({
        tournamentId: 't1',
        stage: 'playoff',
        round: 'playoff_r1',
      });
      expect(call.where.NOT.cup).toEqual(call.data.cup);
      expect(['Mushroom', 'Flower', 'Star', 'Special']).toContain(call.data.cup);
    });

    /**
     * Already-normalized tournaments must not trigger any writes. Prevents
     * polling from churning the DB on every GET.
     */
    it('should not write when every round already has one cup', async () => {
      const normalized = [
        { id: 'pm1', matchNumber: 1, round: 'playoff_r1', cup: 'Flower', player1: {}, player2: {} },
        { id: 'pm2', matchNumber: 2, round: 'playoff_r1', cup: 'Flower', player1: {}, player2: {} },
      ];
      (prisma.gPMatch.findMany as jest.Mock)
        .mockResolvedValueOnce(normalized)
        .mockResolvedValueOnce([]);

      (prisma.gPMatch as any).updateMany = jest.fn();

      (paginate as jest.Mock).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
      });
      (generateBracketStructure as jest.Mock).mockReturnValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });


      expect((prisma.gPMatch as any).updateMany).not.toHaveBeenCalled();
    });
  });

  describe('POST - Create finals bracket', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Creates finals bracket with 8 players
    it('should create finals bracket with top 8 qualified players', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 8, points: 40, player: { id: 'p1', name: 'Player 1' } },
        { id: 'q2', playerId: 'p2', score: 6, points: 36, player: { id: 'p2', name: 'Player 2' } },
        { id: 'q3', playerId: 'p3', score: 6, points: 30, player: { id: 'p3', name: 'Player 3' } },
        { id: 'q4', playerId: 'p4', score: 4, points: 24, player: { id: 'p4', name: 'Player 4' } },
        { id: 'q5', playerId: 'p5', score: 4, points: 18, player: { id: 'p5', name: 'Player 5' } },
        { id: 'q6', playerId: 'p6', score: 2, points: 12, player: { id: 'p6', name: 'Player 6' } },
        { id: 'q7', playerId: 'p7', score: 2, points: 6, player: { id: 'p7', name: 'Player 7' } },
        { id: 'q8', playerId: 'p8', score: 0, points: 0, player: { id: 'p8', name: 'Player 8' } },
      ];

      const mockBracket = [
        { matchNumber: 1, round: 'winners_qf', player1Seed: 1, player2Seed: 8, position: 1 },
        { matchNumber: 2, round: 'winners_qf', player1Seed: 4, player2Seed: 5, position: 2 },
        { matchNumber: 3, round: 'winners_qf', player1Seed: 2, player2Seed: 7, position: 1 },
        { matchNumber: 4, round: 'winners_qf', player1Seed: 3, player2Seed: 6, position: 2 },
      ];

      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.gPMatch.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);
      // Issue #420: bracket inserted in one createMany then re-fetched.
      (prisma.gPMatch.createMany as jest.Mock).mockResolvedValue({ count: mockBracket.length });
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      // Source returns 201 for successful resource creation (POST)
      expect(result.status).toBe(201);
      expect(result.data).toEqual({
        message: 'Finals bracket created',
        matches: expect.any(Array),
        seededPlayers: expect.any(Array),
        bracketStructure: mockBracket,
      });
      expect(prisma.gPMatch.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1', stage: 'finals' } });
      // All bracket matches inserted in a single createMany call carrying all matchNumbers.
      expect(prisma.gPMatch.createMany).toHaveBeenCalledTimes(1);
      expect((prisma.gPMatch.createMany as jest.Mock).mock.calls[0][0].data).toHaveLength(mockBracket.length);
    });

    // Validation error case - Returns 400 when topN is not 8
    it('should return 400 when topN is not 8', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 4 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported', code: 'VALIDATION_ERROR', details: { field: 'topN' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when not enough players qualified
    it('should return 400 when not enough players qualified', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 8, points: 40, player: { id: 'p1', name: 'Player 1' } },
      ];

      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Not enough players qualified. Need 8, found 1', code: 'VALIDATION_ERROR', details: { field: 'qualifications' } });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.gPQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to create grand prix finals bracket', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith('Failed to create finals', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Uses default topN of 8 when not provided
    it('should use default topN of 8 when not provided', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 8, points: 40, player: { id: 'p1', name: 'Player 1' } },
        { id: 'q2', playerId: 'p2', score: 6, points: 36, player: { id: 'p2', name: 'Player 2' } },
        { id: 'q3', playerId: 'p3', score: 6, points: 30, player: { id: 'p3', name: 'Player 3' } },
        { id: 'q4', playerId: 'p4', score: 4, points: 24, player: { id: 'p4', name: 'Player 4' } },
        { id: 'q5', playerId: 'p5', score: 4, points: 18, player: { id: 'p5', name: 'Player 5' } },
        { id: 'q6', playerId: 'p6', score: 2, points: 12, player: { id: 'p6', name: 'Player 6' } },
        { id: 'q7', playerId: 'p7', score: 2, points: 6, player: { id: 'p7', name: 'Player 7' } },
        { id: 'q8', playerId: 'p8', score: 0, points: 0, player: { id: 'p8', name: 'Player 8' } },
      ];

      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.gPMatch.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (generateBracketStructure as jest.Mock).mockReturnValue([]);
      (prisma.gPMatch.createMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      // Source returns 201 for successful resource creation (POST)
      expect(result.status).toBe(201);
    });

    it('should assign the same cup to every playoff match in a round', async () => {
      const mockQualifications = Array.from({ length: 24 }, (_, index) => ({
        id: `q${index + 1}`,
        playerId: `p${index + 1}`,
        group: index < 12 ? 'A' : 'B',
        score: 24 - index,
        points: (24 - index) * 3,
        player: { id: `p${index + 1}`, name: `Player ${index + 1}` },
      }));
      const playoffStructure = [
        { matchNumber: 1, round: 'playoff_r1', player1Seed: 1, player2Seed: 8 },
        { matchNumber: 2, round: 'playoff_r1', player1Seed: 4, player2Seed: 5 },
        { matchNumber: 5, round: 'playoff_r2', player1Seed: 1, player2Seed: null, advancesToUpperSeed: 16 },
      ];

      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      /* Three findMany calls: existingPlayoff → [], existingFinals → [],
       * post-createMany lookup → [] (cup verified via createMany data). */
      (prisma.gPMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      /* Phase 1 uses createMany (#703) not sequential create calls. */
      (prisma.gPMatch.createMany as jest.Mock).mockResolvedValue({ count: 3 });
      (generatePlayoffStructure as jest.Mock).mockReturnValue(playoffStructure);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { topN: 24 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      const createManyData = (prisma.gPMatch.createMany as jest.Mock).mock.calls[0][0].data as Array<Record<string, unknown>>;
      expect(createManyData[0].cup).toBe(createManyData[1].cup);
      expect(createManyData[0].cup).not.toBe(createManyData[2].cup);
    });
  });

  describe('PUT - Update finals match score', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Updates match and advances winner
    it('should update match and advance winner to next round', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 3,
        points2: 1,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const updatedMatch = { ...mockMatch, completed: true };
      const mockBracket = [
        { matchNumber: 1, round: 'winners_qf', player1Seed: 1, player2Seed: 8, winnerGoesTo: 5, loserGoesTo: 9, position: 1 },
      ];

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);
      (prisma.gPMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm5' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        match: updatedMatch,
        winnerId: 'p1',
        loserId: 'p2',
        isComplete: false,
        champion: null,
      });
      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm5' },
          data: { player1Id: 'p1' },
        })
      );
    });

    it('should keep GP finals match pending until FT2 cup wins are reached', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 0,
        points2: 0,
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, points1: 1, points2: 0, completed: false });
      (generateBracketStructure as jest.Mock).mockReturnValue([
        { matchNumber: 1, round: 'winners_qf', winnerGoesTo: 5, loserGoesTo: 9, position: 1 },
      ]);

      const request = new MockNextRequest(
        'http://localhost:3000/api/tournaments/t1/gp/finals',
        { matchId: 'm1', cupResults: [{ cup: 'Mushroom', points1: 45, points2: 0 }] },
      );
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      const firstUpdateCall = (prisma.gPMatch.update as jest.Mock).mock.calls[0][0];
      expect(firstUpdateCall.where).toEqual({ id: 'm1' });
      expect(firstUpdateCall.data.points1).toBe(1);
      expect(firstUpdateCall.data.points2).toBe(0);
      expect(firstUpdateCall.data.completed).toBe(false);
      expect(firstUpdateCall.data.cupResults).toHaveLength(1);
      expect(prisma.gPMatch.findFirst).not.toHaveBeenCalled();
      expect(result.data).toEqual({
        match: { ...mockMatch, points1: 1, points2: 0, completed: false },
        winnerId: null,
        loserId: null,
        isComplete: false,
        champion: null,
      });
    });

    it('should complete GP finals match once FT2 cup wins are reached', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 1,
        points2: 0,
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, points1: 2, points2: 0, completed: true });
      (generateBracketStructure as jest.Mock).mockReturnValue([
        { matchNumber: 1, round: 'winners_qf', winnerGoesTo: 5, loserGoesTo: 9, position: 1 },
      ]);
      (prisma.gPMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm5' });

      const request = new MockNextRequest(
        'http://localhost:3000/api/tournaments/t1/gp/finals',
        {
          matchId: 'm1',
          cupResults: [
            { cup: 'Mushroom', points1: 45, points2: 0 },
            { cup: 'Flower', points1: 45, points2: 0 },
          ],
        },
      );
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      const scoreUpdate = (prisma.gPMatch.update as jest.Mock).mock.calls[0][0];
      expect(scoreUpdate.data.points1).toBe(2);
      expect(scoreUpdate.data.points2).toBe(0);
      expect(scoreUpdate.data.completed).toBe(true);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm5' },
          data: { player1Id: 'p1' },
        })
      );
      expect(result.data.winnerId).toBe('p1');
      expect(result.data.loserId).toBe('p2');
    });

    // Success case - Completes tournament with winner from winners bracket
    it('should complete tournament when winner from winners bracket wins grand final', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'grand_final',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 3,
        points2: 0,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const updatedMatch = { ...mockMatch, completed: true };
      const mockBracket = [
        { matchNumber: 1, round: 'grand_final', player1Seed: 1, player2Seed: 2, winnerGoesTo: null, loserGoesTo: null },
      ];

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 0 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        match: updatedMatch,
        winnerId: 'p1',
        loserId: 'p2',
        isComplete: true,
        champion: 'p1',
      });
      expect(result.status).toBe(200);
    });

    // Success case - Triggers grand final reset when losers bracket wins
    it('should trigger grand final reset when losers bracket wins', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'grand_final',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 2,
        points2: 3,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const updatedMatch = { ...mockMatch, completed: true };
      const mockBracket = [
        { matchNumber: 1, round: 'grand_final', player1Seed: 1, player2Seed: 2, winnerGoesTo: null, loserGoesTo: null },
      ];
      const resetMatch = { id: 'm2', player1Id: '', player2Id: '' };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);
      (prisma.gPMatch.findFirst as jest.Mock).mockResolvedValue(resetMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 2, score2: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm2' },
          data: { player1Id: 'p2', player2Id: 'p1' },
        })
      );
    });

    // Success case - Completes tournament in reset match
    it('should complete tournament in grand final reset match', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'grand_final_reset',
        stage: 'finals',
        player1Id: 'p2',
        player2Id: 'p1',
        points1: 3,
        points2: 1,
        completed: false,
        player1: { id: 'p2', name: 'Player 2' },
        player2: { id: 'p1', name: 'Player 1' },
      };

      const updatedMatch = { ...mockMatch, completed: true };
      const mockBracket = [
        { matchNumber: 1, round: 'grand_final_reset', player1Seed: null, player2Seed: null, winnerGoesTo: null, loserGoesTo: null },
      ];

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        match: updatedMatch,
        winnerId: 'p2',
        loserId: 'p1',
        isComplete: true,
        champion: 'p2',
      });
      expect(result.status).toBe(200);
    });

    // Validation error case - Returns 400 when matchId is missing
    it('should return 400 when matchId is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId and score data are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId and score data are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId and score data are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Not found case - Returns 404 when match is not found
    it('should return 404 when match is not found', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Finals match not found', code: 'NOT_FOUND' });
      expect(result.status).toBe(404);
    });

    it('should save tied GP finals score as an unresolved cup without sudden death', async () => {
      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, points1: 0, points2: 0, completed: false });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 2, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.match.completed).toBe(false);
    });

    /**
     * A tied GP cup is unresolved, including 0-0. The match stays pending
     * until a later cup gives one player enough cup wins.
     */
    it('should allow a 0-0 tied cup as pending', async () => {
      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, points1: 0, points2: 0, completed: false });

      const request = new MockNextRequest(
        'http://localhost:3000/api/tournaments/t1/gp/finals',
        { matchId: 'm1', score1: 0, score2: 0 },
      );
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.match.completed).toBe(false);
    });

    it('should reject negative GP finals driver points', async () => {
      const mockMatch = {
        id: 'm1',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: -1, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Driver points must be non-negative integers', code: 'VALIDATION_ERROR', details: { field: 'score' } });
      expect(result.status).toBe(400);
    });

    it('should ignore sudden-death winner on tied GP finals scores and keep match pending', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 2,
        points2: 2,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const updatedMatch = { ...mockMatch, points1: 0, points2: 0, completed: false, suddenDeathWinnerId: null };
      const mockBracket = [
        { matchNumber: 1, round: 'winners_qf', player1Seed: 1, player2Seed: 8, winnerGoesTo: 5, loserGoesTo: 9, position: 1 },
      ];

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);
      (prisma.gPMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm5' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', {
        matchId: 'm1',
        score1: 2,
        score2: 2,
        suddenDeathWinnerId: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        match: updatedMatch,
        winnerId: null,
        loserId: null,
        isComplete: false,
        champion: null,
      });
      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({
            points1: 0,
            points2: 0,
            suddenDeathWinnerId: null,
            completed: false,
          }),
        }),
      );
    });

    it('should allow GP playoff round 1 results to finish at first to 1', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'playoff_r1',
        stage: 'playoff',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, points1: 1, points2: 0, completed: true });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 1, score2: 0 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.stage).toBe('playoff');
      expect(result.data.winnerId).toBe('p1');
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update match', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith('Failed to update finals match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Updates loser position correctly
    it('should update loser position correctly based on round', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        round: 'winners_sf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 3,
        points2: 0,
        completed: false,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const updatedMatch = { ...mockMatch, completed: true };
      const mockBracket = [
        { matchNumber: 1, round: 'winners_sf', player1Seed: 1, player2Seed: 4, winnerGoesTo: 5, loserGoesTo: 7, position: 1 },
      ];

      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (generateBracketStructure as jest.Mock).mockReturnValue(mockBracket);
      (prisma.gPMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm7' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/finals', { matchId: 'm1', score1: 3, score2: 0 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm7' },
          data: { player1Id: 'p2' },
        })
      );
    });
  });
});
