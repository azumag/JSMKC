/**
 * @module __tests__/lib/api-factories/finals-route.test.ts
 *
 * Test suite for finals route factory from `@/lib/api-factories/finals-route`.
 *
 * This suite validates the factory function that generates GET/POST/PUT handlers
 * for double-elimination finals API routes. Tests cover:
 *
 * - GET handler: Fetching finals bracket data
 *   - Paginated style (GP pattern) using paginate()
 *   - Grouped style (BM pattern) with winners/losers/grandFinal arrays
 *   - Simple style (MR pattern) with flat matches array
 *   - Empty matches handling (returns empty bracketStructure)
 *   - Error handling for database failures
 * - POST handler: Creating 8-player double-elimination bracket
 *   - Authentication requirement (postRequiresAuth)
 *   - Top N validation (must be 8)
 *   - Qualifications validation (must have enough qualified players)
 *   - Bracket generation from qualification standings
 * - PUT handler: Updating match score and auto-advancing players through bracket
 *   - Winner/loser determination based on scores (best of 5, first to 3)
 *   - Bracket progression: advancing winner and moving loser through bracket
 *   - Grand Final reset logic when loser bracket champion wins first GF
 *   - Tournament completion detection
 *   - Additional field handling (putAdditionalFields)
 *   - Input sanitization (sanitizePutBody)
 *   - Error handling for missing matches, validation errors, and DB failures
 *
 * Tests mock all dependencies including prisma, auth, pagination,
 * double-elimination, sanitize, and logger to isolate the factory function behavior.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

import { buildQualificationRankLabelMap, createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/double-elimination');
jest.mock('@/lib/pagination');
jest.mock('@/lib/sanitize');
jest.mock('@/lib/logger');
jest.mock('@/lib/audit-log');

import { auth } from '@/lib/auth';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Finals Route Factory', () => {
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockGenerateBracketStructure: jest.MockedFunction<typeof generateBracketStructure>;
  let mockGeneratePlayoffStructure: jest.MockedFunction<typeof generatePlayoffStructure>;
  let mockPaginate: jest.MockedFunction<typeof paginate>;
  let mockSanitizeInput: jest.MockedFunction<typeof sanitizeInput>;
  let mockLogger: ReturnType<typeof createLogger>;

  const createMockConfig = (overrides = {}) => ({
    eventTypeCode: 'bm' as const,
    matchModel: 'bMMatch',
    qualificationModel: 'bMQualification',
    loggerName: 'bm-finals',
    getStyle: 'paginated' as const,
    sanitizePutBody: false,
    sanitizePostBody: false,
    qualificationOrderBy: [{ score: 'desc' }],
    putScoreFields: { dbField1: 'score1', dbField2: 'score2' },
    getErrorMessage: 'Failed to fetch finals',
    postErrorMessage: 'Failed to create finals',
    postRequiresAuth: false,
    putRequiresAuth: false,
    ...overrides,
  });

  const createMockMatch = (overrides = {}) => ({
    id: 'match-1',
    matchNumber: 1,
    stage: 'finals',
    round: 'winners_qf',
    player1Id: 'player-1',
    player2Id: 'player-2',
    score1: 0,
    score2: 0,
    completed: false,
    player1: { id: 'player-1', name: 'Player 1' },
    player2: { id: 'player-2', name: 'Player 2' },
    player1Tbd: false,
    player2Tbd: false,
    ...overrides,
  });

  const expectNoBmMatchWrites = () => {
    const matchModel = prisma.bMMatch as any;
    for (const method of ['create', 'createMany', 'deleteMany', 'update', 'updateMany']) {
      expect(matchModel[method]).not.toHaveBeenCalled();
    }
  };

  describe('buildQualificationRankLabelMap', () => {
    it('assigns group labels from rank order even when input rows are shuffled', () => {
      const labels = buildQualificationRankLabelMap([
        { playerId: 'b2', group: 'B', _rank: 2 },
        { playerId: 'a2', group: 'A', _rank: 2 },
        { playerId: 'b1', group: 'B', _rank: 1 },
        { playerId: 'a1', group: 'A', _rank: 1 },
      ]);

      expect(Object.fromEntries(labels)).toEqual({
        a1: 'A1',
        a2: 'A2',
        b1: 'B1',
        b2: 'B2',
      });
    });

    it('keeps original order for tied ranks within the same group', () => {
      const labels = buildQualificationRankLabelMap([
        { playerId: 'a-first', group: 'A', _rank: 1 },
        { playerId: 'a-second', group: 'A', _rank: 1 },
        { playerId: 'a-third', group: 'A', _rank: 3 },
      ]);

      expect(Object.fromEntries(labels)).toEqual({
        'a-first': 'A1',
        'a-second': 'A2',
        'a-third': 'A3',
      });
    });

    it('uses numeric labels when qualifications have no group', () => {
      const labels = buildQualificationRankLabelMap([
        { playerId: 'p2', group: null, _rank: 2 },
        { playerId: 'p1', group: null, _rank: 1 },
      ]);

      expect(Object.fromEntries(labels)).toEqual({
        p1: '1',
        p2: '2',
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.findFirst as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({
        id: args?.where?.OR?.[0]?.id ?? 't1',
        bmQualificationConfirmed: false,
        mrQualificationConfirmed: false,
        gpQualificationConfirmed: false,
      }),
    );

    // Setup mocks
    mockAuth = jest.mocked(auth);
    mockGenerateBracketStructure = generateBracketStructure as jest.MockedFunction<typeof generateBracketStructure>;
    mockGeneratePlayoffStructure = generatePlayoffStructure as jest.MockedFunction<typeof generatePlayoffStructure>;
    mockPaginate = paginate as jest.MockedFunction<typeof paginate>;
    mockSanitizeInput = sanitizeInput as jest.MockedFunction<typeof sanitizeInput>;
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    (createLogger as jest.Mock).mockReturnValue(mockLogger);
    (createAuditLog as jest.Mock).mockResolvedValue(undefined);
    mockSanitizeInput.mockImplementation((input) => input);

    /* The GET and POST handlers now short-circuit with 404 when the
     * tournament lookup returns null. Provide a default stub so every
     * test that does not explicitly set this otherwise gets a valid
     * tournament; individual "tournament not found" tests override. */
    (prisma.tournament as any).findUnique.mockResolvedValue({
      id: 'tournament-123',
      name: 'Test Tournament',
    });

    // Default 8-player bracket count (17 matches: 17 <= 20 → bracketSize=8)
    (prisma.bMMatch as any).count.mockResolvedValue(17);

    /* Default findMany mock: returns empty array for playoff-stage queries
     * and an empty array for finals-stage queries. Individual tests override
     * with mockResolvedValue or mockImplementation as needed. This default
     * ensures the new shared playoff query (stage='playoff') always resolves
     * without throwing, even for tests that only care about the finals path. */
    (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
      if (args?.where?.stage === 'playoff') return Promise.resolve([]);
      if (args?.select?.completed) return Promise.resolve([createMockMatch()]);
      return Promise.resolve([]);
    });

    // Helper to create complete 17-match bracket structure
    // Note: matchNumber 17 is skipped in 8-player bracket, reset is at 18
    const createFullBracketStructure = () => {
      // Winners QF (matches 1-4): 1v8, 4v5, 2v7, 3v6
      // Winners SF (matches 5-6): winners of QF
      // Winners Final (match 7): winners of SF
      // Losers R1 (matches 8-9): losers of QF
      // Losers R2 (matches 10-11): losers of winners SF + R1
      // Losers R3 (matches 12-13): losers from previous rounds
      // Losers SF (match 14): final losers bracket match
      // Losers Final (match 15): loser bracket winner
      // Grand Final (match 16): winners bracket winner vs losers bracket winner
      // Grand Final Reset (match 18): played if losers bracket winner wins first GF
      // Note: Match 17 is not used - grand_final winnerGoesTo points to 18
      return [
        {
          matchNumber: 1,
          round: 'winners_qf',
          bracket: 'winners',
          player1Seed: 1,
          player2Seed: 8,
          winnerGoesTo: 5,
          loserGoesTo: 9,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 2,
          round: 'winners_qf',
          bracket: 'winners',
          player1Seed: 4,
          player2Seed: 5,
          winnerGoesTo: 5,
          loserGoesTo: 10,
          position: 2,
          loserPosition: 2,
        },
        {
          matchNumber: 3,
          round: 'winners_qf',
          bracket: 'winners',
          player1Seed: 2,
          player2Seed: 7,
          winnerGoesTo: 6,
          loserGoesTo: 10,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 4,
          round: 'winners_qf',
          bracket: 'winners',
          player1Seed: 3,
          player2Seed: 6,
          winnerGoesTo: 6,
          loserGoesTo: 9,
          position: 2,
          loserPosition: 2,
        },
        {
          matchNumber: 5,
          round: 'winners_sf',
          bracket: 'winners',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 7,
          loserGoesTo: 13,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 6,
          round: 'winners_sf',
          bracket: 'winners',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 7,
          loserGoesTo: 14,
          position: 2,
          loserPosition: 1,
        },
        {
          matchNumber: 7,
          round: 'winners_final',
          bracket: 'winners',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 16,
          loserGoesTo: 15,
          position: 1,
          loserPosition: 2,
        },
        {
          matchNumber: 8,
          round: 'losers_r1',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 11,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 9,
          round: 'losers_r1',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 12,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 10,
          round: 'losers_r2',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 11,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 11,
          round: 'losers_r2',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 12,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 12,
          round: 'losers_r3',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 14,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 13,
          round: 'losers_r3',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 14,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 14,
          round: 'losers_sf',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 15,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 15,
          round: 'losers_final',
          bracket: 'losers',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 16,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 16,
          round: 'grand_final',
          bracket: 'grand_final',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: 18,
          loserGoesTo: undefined,
        },
        {
          matchNumber: 18,
          round: 'grand_final_reset',
          bracket: 'grand_final',
          player1Seed: null,
          player2Seed: null,
          winnerGoesTo: undefined,
        },
      ];
    };

    const create16PlayerBracketStructure = (groupCount: 2 | 3 | 4 = 3) => {
      const structure = [
        {
          matchNumber: 1,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 1,
          player2Seed: 16,
          winnerGoesTo: 9,
          loserGoesTo: 16,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 2,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 8,
          player2Seed: 9,
          winnerGoesTo: 9,
          loserGoesTo: 16,
          position: 2,
          loserPosition: 2,
        },
        {
          matchNumber: 3,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 4,
          player2Seed: 13,
          winnerGoesTo: 10,
          loserGoesTo: 17,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 4,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 5,
          player2Seed: 12,
          winnerGoesTo: 10,
          loserGoesTo: 17,
          position: 2,
          loserPosition: 2,
        },
        {
          matchNumber: 5,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 2,
          player2Seed: 15,
          winnerGoesTo: 11,
          loserGoesTo: 18,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 6,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 7,
          player2Seed: 10,
          winnerGoesTo: 11,
          loserGoesTo: 18,
          position: 2,
          loserPosition: 2,
        },
        {
          matchNumber: 7,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 3,
          player2Seed: 14,
          winnerGoesTo: 12,
          loserGoesTo: 19,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 8,
          round: 'winners_r1',
          bracket: 'winners',
          player1Seed: 6,
          player2Seed: 11,
          winnerGoesTo: 12,
          loserGoesTo: 19,
          position: 2,
          loserPosition: 2,
        },
        {
          matchNumber: 9,
          round: 'winners_qf',
          bracket: 'winners',
          winnerGoesTo: 13,
          loserGoesTo: 23,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 10,
          round: 'winners_qf',
          bracket: 'winners',
          winnerGoesTo: 13,
          loserGoesTo: 22,
          position: 2,
          loserPosition: 1,
        },
        {
          matchNumber: 11,
          round: 'winners_qf',
          bracket: 'winners',
          winnerGoesTo: 14,
          loserGoesTo: 21,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 12,
          round: 'winners_qf',
          bracket: 'winners',
          winnerGoesTo: 14,
          loserGoesTo: 20,
          position: 2,
          loserPosition: 1,
        },
        {
          matchNumber: 13,
          round: 'winners_sf',
          bracket: 'winners',
          winnerGoesTo: 15,
          loserGoesTo: 26,
          position: 1,
          loserPosition: 1,
        },
        {
          matchNumber: 14,
          round: 'winners_sf',
          bracket: 'winners',
          winnerGoesTo: 15,
          loserGoesTo: 27,
          position: 2,
          loserPosition: 1,
        },
        {
          matchNumber: 15,
          round: 'winners_final',
          bracket: 'winners',
          winnerGoesTo: 30,
          loserGoesTo: 29,
          position: 1,
          loserPosition: 2,
        },
        { matchNumber: 16, round: 'losers_r1', bracket: 'losers', winnerGoesTo: 20, position: 2 },
        { matchNumber: 17, round: 'losers_r1', bracket: 'losers', winnerGoesTo: 21, position: 2 },
        { matchNumber: 18, round: 'losers_r1', bracket: 'losers', winnerGoesTo: 22, position: 2 },
        { matchNumber: 19, round: 'losers_r1', bracket: 'losers', winnerGoesTo: 23, position: 2 },
        ...Array.from({ length: 12 }, (_, i) => ({
          matchNumber: i + 20,
          round:
            i < 4
              ? 'losers_r2'
              : i < 6
                ? 'losers_r3'
                : i < 8
                  ? 'losers_r4'
                  : i === 8
                    ? 'losers_sf'
                    : i === 9
                      ? 'losers_final'
                      : i === 10
                        ? 'grand_final'
                        : 'grand_final_reset',
          bracket: i >= 10 ? 'grand_final' : 'losers',
        })),
      ];
      if (groupCount === 2) {
        const fixedPairs = [
          [1, 16],
          [8, 9],
          [4, 13],
          [5, 12],
          [2, 15],
          [7, 10],
          [3, 14],
          [6, 11],
        ];
        structure.slice(0, 8).forEach((match, index) => {
          match.player1Seed = fixedPairs[index][0];
          match.player2Seed = fixedPairs[index][1];
        });
      }
      return structure;
    };

    // Default bracket structure with 17 or 31 matches based on requested size.
    mockGenerateBracketStructure.mockImplementation((count: number, groupCount?: 2 | 3 | 4) =>
      count === 16 ? create16PlayerBracketStructure(groupCount) : createFullBracketStructure(),
    );

    // Default playoff structure (issue #454) — 8 matches, 4 R1 + 4 R2.
    // Mirrors real generatePlayoffStructure(12) so handleTop24Post tests
    // exercise the real routing/mapping semantics end-to-end. Seeds 17-24 in
    // R1 and BYE seeds 13-16 in R2 (a bye winner keeps their own seed number)
    // per the CDM 2025 official results workbook.
    mockGeneratePlayoffStructure.mockImplementation((_count: number, _groupCount: 2 | 3 | 4 = 3) => {
      const r1Pairs = [
        [17, 24],
        [20, 21],
        [18, 23],
        [19, 22],
      ];
      const byeSeeds = [16, 13, 15, 14];
      const upperSeeds = byeSeeds;
      return [
        ...r1Pairs.map(([player1Seed, player2Seed], index) => ({
          matchNumber: index + 1,
          round: 'playoff_r1',
          bracket: 'winners',
          player1Seed,
          player2Seed,
          winnerGoesTo: index + 5,
          position: 2,
        })),
        ...byeSeeds.map((player1Seed, index) => ({
          matchNumber: index + 5,
          round: 'playoff_r2',
          bracket: 'winners',
          player1Seed,
          advancesToUpperSeed: upperSeeds[index],
        })),
      ];
    });

    // Default paginated result
    mockPaginate.mockResolvedValue({
      data: [createMockMatch()],
      meta: { total: 17, page: 1, limit: 50, totalPages: 1 },
    });
  });

  // ============================================================
  // GET Handler Tests (7 cases)
  // ============================================================

  describe('GET Handler', () => {
    it('should return paginated response with bracketStructure when getStyle is paginated', async () => {
      const config = createMockConfig({ getStyle: 'paginated' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      /* createSuccessResponse wraps the paginate payload; the matches array
       * lives at json.data.data because paginate's own result already has a
       * .data field that sits inside the factory's createSuccessResponse. */
      expect(json.data.data).toEqual([createMockMatch()]);
      expect(json.data.bracketStructure).toBeDefined();
      expect(json.data.roundNames).toEqual(roundNames);
      expect(json.data.qualificationConfirmed).toBe(false);
      expect(mockPaginate).toHaveBeenCalledWith(
        expect.objectContaining({
          findMany: expect.any(Function),
          count: expect.any(Function),
        }),
        { tournamentId: 'tournament-123', stage: 'finals' },
        { matchNumber: 'asc' },
        expect.objectContaining({ page: 1, limit: 50 }),
      );
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(8);
    });

    it('should infer 16-player bracket when total matches > 20 (paginated)', async () => {
      mockPaginate.mockResolvedValue({
        data: [createMockMatch()],
        meta: { total: 31, page: 1, limit: 50, totalPages: 1 },
      });

      const config = createMockConfig({ getStyle: 'paginated' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16, 3);
      const json = await response.json();
      expect(json.data.bracketSize).toBe(16);
    });

    it('keeps a paginated downstream slot resolved when its upstream match is on another page', async () => {
      const upstream = createMockMatch({ matchNumber: 1, completed: true });
      const downstream = createMockMatch({ matchNumber: 5, round: 'winners_sf' });
      mockPaginate.mockResolvedValue({
        data: [downstream],
        meta: { total: 17, page: 2, limit: 1, totalPages: 17 },
      });
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        if (args?.select?.completed) return Promise.resolve([upstream, downstream]);
        return Promise.resolve([]);
      });

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'paginated' }));
      const response = await GET(new NextRequest('http://localhost:3000?page=2&limit=1'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.data[0]).toEqual(expect.objectContaining({ player1Id: 'player-1', player1Tbd: false }));
    });

    it('should default to 8-player bracket when total is 0 (paginated)', async () => {
      mockPaginate.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      const config = createMockConfig({ getStyle: 'paginated' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      /* The factory skips generateBracketStructure when the matches array
       * is empty (returns an empty bracketStructure directly), so we assert
       * the default bracketSize and an empty structure instead. */
      expect(mockGenerateBracketStructure).not.toHaveBeenCalled();
      const json = await response.json();
      expect(json.data.bracketSize).toBe(8);
      expect(json.data.bracketStructure).toEqual([]);
    });

    it('should return grouped response when getStyle is grouped', async () => {
      const mockMatches = [
        createMockMatch({ round: 'winners_qf' }),
        createMockMatch({ round: 'winners_sf' }),
        createMockMatch({ round: 'winners_final' }),
        createMockMatch({ round: 'losers_r1' }),
        createMockMatch({ round: 'losers_sf' }),
        createMockMatch({ round: 'losers_final' }),
        createMockMatch({ round: 'grand_final' }),
      ];

      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        if (typeof args?.where?.stage === 'object') return Promise.resolve([]);
        return Promise.resolve(mockMatches);
      });

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.matches).toEqual(mockMatches);
      expect(json.data.winnersMatches).toHaveLength(3); // winners_qf, winners_sf, winners_final
      expect(json.data.losersMatches).toHaveLength(3); // losers_r1, losers_sf, losers_final
      expect(json.data.grandFinalMatches).toHaveLength(1); // grand_final
      expect(json.data.bracketStructure).toBeDefined();
      expect(json.data.roundNames).toEqual(roundNames);
      expect(json.data.bracketSize).toBe(8);
      /* No playoff matches → empty arrays, phase='finals', playoffComplete=false */
      expect(json.data.playoffMatches).toEqual([]);
      expect(json.data.playoffStructure).toEqual([]);
      expect(json.data.playoffSeededPlayers).toEqual([]);
      expect(json.data.phase).toBe('finals');
      expect(json.data.playoffComplete).toBe(false);
    });

    it('should infer 16-player bracket when matches > 20 (grouped)', async () => {
      // 16-player bracket has 31 matches
      const mockMatches = Array.from({ length: 31 }, (_, i) => createMockMatch({ matchNumber: i + 1 }));
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        if (typeof args?.where?.stage === 'object') return Promise.resolve([]);
        return Promise.resolve(mockMatches);
      });

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16, 3);
      const json = await response.json();
      expect(json.data.bracketSize).toBe(16);
    });

    it('should return simple response when getStyle is simple', async () => {
      const mockMatches = [createMockMatch()];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        if (typeof args?.where?.stage === 'object') return Promise.resolve([]);
        return Promise.resolve(mockMatches);
      });

      const config = createMockConfig({ getStyle: 'simple' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.matches).toEqual(mockMatches);
      expect(json.data.bracketStructure).toBeDefined();
      expect(json.data.roundNames).toEqual(roundNames);
      expect(json.data.winnersMatches).toBeUndefined();
      expect(json.data.losersMatches).toBeUndefined();
      expect(json.data.grandFinalMatches).toBeUndefined();
      expect(json.data.bracketSize).toBe(8);
      expect(json.data.phase).toBe('finals');
      expect(json.data.playoffComplete).toBe(false);
    });

    it('keeps qualification seeds after a manual opening-slot swap', async () => {
      const qualifications = Array.from({ length: 8 }, (_, index) => ({
        id: `q${index + 1}`,
        playerId: `p${index + 1}`,
        group: null,
        score: 8 - index,
        points: 8 - index,
        player: { id: `p${index + 1}`, name: `Player ${index + 1}` },
      }));
      qualifications[0].score = -1;
      qualifications[7].score = 99;
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        bmQualificationConfirmed: false,
        mrQualificationConfirmed: false,
        gpQualificationConfirmed: false,
        /* This was captured when the bracket was generated. The ranking below
         * is intentionally different, proving GET no longer re-seeds an
         * already published KO bracket after a ranking correction. */
        bmFinalsSeedSnapshot: qualifications.map((qualification, index) => ({
          seed: index + 1,
          originalSeed: index + 1,
          playerId: qualification.playerId,
          player: qualification.player,
        })),
      });
      const swappedMatch = createMockMatch({
        matchNumber: 1,
        round: 'winners_qf',
        player1Id: 'p8',
        player2Id: 'p1',
        player1: qualifications[7].player,
        player2: qualifications[0].player,
        slotOverrideAt: '2026-07-22T00:00:00.000Z',
      });
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        return Promise.resolve([swappedMatch]);
      });

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'simple' }));
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.seededPlayers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ playerId: 'p1', originalSeed: 1 }),
          expect.objectContaining({ playerId: 'p8', originalSeed: 8 }),
        ]),
      );
    });

    it('does not persist a replacement seed snapshot for a legacy standard slot override', async () => {
      const swappedMatch = createMockMatch({
        matchNumber: 1,
        round: 'winners_qf',
        player1Id: 'p8',
        player2Id: 'p1',
        player1: { id: 'p8', name: 'Player 8' },
        player2: { id: 'p1', name: 'Player 1' },
        slotOverrideAt: '2026-07-22T00:00:00.000Z',
      });
      (prisma.bMQualification as any).findMany.mockResolvedValue(
        Array.from({ length: 8 }, (_, index) => ({
          id: `q${index + 1}`,
          playerId: `p${index + 1}`,
          group: null,
          score: 8 - index,
          points: 8 - index,
          player: { id: `p${index + 1}`, name: `Player ${index + 1}` },
        })),
      );
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        return Promise.resolve([swappedMatch]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(17);

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'simple' }));
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(409);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it('rejects an incomplete legacy standard opening round without a seed snapshot', async () => {
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        return Promise.resolve([createMockMatch({ matchNumber: 1, round: 'winners_qf' })]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(17);

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'simple' }));
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual(expect.objectContaining({ code: 'FINALS_SEED_REPAIR_REQUIRED' }));
    });

    it('re-resolves an old partial snapshot instead of treating its 12 rows as authoritative', async () => {
      const opening = [
        createMockMatch({ matchNumber: 1, round: 'winners_qf', player1Id: 'p1', player2Id: 'p8' }),
        createMockMatch({ matchNumber: 2, round: 'winners_qf', player1Id: 'p4', player2Id: 'p5' }),
        createMockMatch({ matchNumber: 3, round: 'winners_qf', player1Id: 'p2', player2Id: 'p7' }),
        createMockMatch({ matchNumber: 4, round: 'winners_qf', player1Id: 'p3', player2Id: 'p6' }),
      ];
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        bmQualificationConfirmed: false,
        mrQualificationConfirmed: false,
        gpQualificationConfirmed: false,
        bmFinalsSeedSnapshot: Array.from({ length: 12 }, (_, index) => ({
          seed: index + 13,
          originalSeed: index + 13,
          playerId: `old-${index + 13}`,
          player: { id: `old-${index + 13}` },
        })),
      });
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        return Promise.resolve(opening);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(17);

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'simple' }));
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bmFinalsSeedSnapshot: expect.arrayContaining([
              expect.objectContaining({ originalSeed: 1, playerId: 'p1' }),
            ]),
          }),
        }),
      );
    });

    it('does not persist Top-24 Phase-1-only fallback seeds', async () => {
      const qualifications = ['A', 'B'].flatMap((group) =>
        Array.from({ length: 12 }, (_, index) => {
          const rank = index + 1;
          const playerId = `${group}${rank}`;
          return {
            id: `qual-${playerId}`,
            playerId,
            group,
            score: 100 - rank,
            points: 100 - rank,
            player: { id: playerId, name: playerId },
          };
        }),
      );
      const playoff = Array.from({ length: 8 }, (_, index) =>
        createMockMatch({
          matchNumber: index + 1,
          stage: 'playoff',
          round: index < 4 ? 'playoff_r1' : 'playoff_r2',
          completed: false,
        }),
      );
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff' || typeof args?.where?.stage === 'object') return Promise.resolve(playoff);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'simple' }));
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(409);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it('does not persist Top-24 fallback seeds after a legacy manual slot adjustment', async () => {
      const qualifications = ['A', 'B'].flatMap((group) =>
        Array.from({ length: 12 }, (_, index) => {
          const rank = index + 1;
          const playerId = `${group}${rank}`;
          return {
            id: `qual-${playerId}`,
            playerId,
            group,
            score: 100 - rank,
            points: 100 - rank,
            player: { id: playerId, name: playerId },
          };
        }),
      );
      const playoff = Array.from({ length: 8 }, (_, index) =>
        createMockMatch({
          matchNumber: index + 1,
          stage: 'playoff',
          round: index < 4 ? 'playoff_r1' : 'playoff_r2',
          completed: false,
          ...(index === 0 ? { slotOverrideAt: '2026-07-22T00:00:00.000Z' } : {}),
        }),
      );
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff' || typeof args?.where?.stage === 'object') return Promise.resolve(playoff);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const { GET } = createFinalsHandlers(createMockConfig({ getStyle: 'simple' }));
      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(409);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it('should return empty bracketStructure when matches array is empty', async () => {
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({ getStyle: 'simple' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.matches).toEqual([]);
      expect(json.data.bracketStructure).toEqual([]);
      expect(json.data.bracketSize).toBe(8);
    });

    /* Issue #728: GET must repair legacy bracket rows whose startingCourseNumber
     * is null or desynced within a round. The repair should call updateMany
     * scoped to (tournamentId, stage, round) with a value in [1,4]. */
    it('repairs mixed-null startingCourseNumber on the playoff stage GET', async () => {
      const playoffMatches = [
        createMockMatch({ id: 'p1', stage: 'playoff', round: 'playoff_r1', startingCourseNumber: null }),
        createMockMatch({ id: 'p2', stage: 'playoff', round: 'playoff_r1', startingCourseNumber: 3 }),
        createMockMatch({ id: 'p3', stage: 'playoff', round: 'playoff_r1', startingCourseNumber: null }),
        createMockMatch({ id: 'p4', stage: 'playoff', round: 'playoff_r1', startingCourseNumber: 3 }),
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffMatches);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 2 });

      const config = createMockConfig({
        getStyle: 'grouped',
        assignBmStartingCourseByRound: true,
      });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      /* Dominant value (3) must win. The repair WHERE must explicitly include
       * null rows because NOT(col=?) alone silently skips them in SQL. */
      const updateCall = (prisma.bMMatch as any).updateMany.mock.calls.find(
        (c: any[]) => c[0]?.where?.stage === 'playoff' && c[0]?.where?.round === 'playoff_r1',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].where).toMatchObject({
        tournamentId: 'tournament-123',
        stage: 'playoff',
        round: 'playoff_r1',
      });
      expect(updateCall[0].data).toEqual({ startingCourseNumber: 3 });
      expect(updateCall[0].where.OR).toEqual([{ startingCourseNumber: null }, { NOT: { startingCourseNumber: 3 } }]);
    });

    /* Issue #771: all-null rounds must NOT be re-filled by normalization.
     * POST (bracket creation) assigns values via createBmRoundStartingCourses.
     * An all-null round means the admin explicitly cleared it via PATCH.
     * Re-filling would silently undo that intentional clear. */
    it('does not repair all-null round — preserves intentional clear (BM finals, #771)', async () => {
      const finalsMatches = [
        createMockMatch({ id: 'f1', stage: 'finals', round: 'winners_qf', startingCourseNumber: null }),
        createMockMatch({ id: 'f2', stage: 'finals', round: 'winners_qf', startingCourseNumber: null }),
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        if (args?.where?.stage === 'finals') return Promise.resolve(finalsMatches);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 2 });

      const config = createMockConfig({
        getStyle: 'grouped',
        assignBmStartingCourseByRound: true,
      });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      /* No updateMany should target this all-null round. */
      const updateManyCalls = (prisma.bMMatch as any).updateMany.mock.calls;
      const repairCall = updateManyCalls.find(
        (c: any[]) => c[0]?.where?.stage === 'finals' && c[0]?.where?.round === 'winners_qf',
      );
      expect(repairCall).toBeUndefined();
    });

    it('does not repair when assignBmStartingCourseByRound is off', async () => {
      const playoffMatches = [
        createMockMatch({ id: 'p1', stage: 'playoff', round: 'playoff_r1', startingCourseNumber: null }),
        createMockMatch({ id: 'p2', stage: 'playoff', round: 'playoff_r1', startingCourseNumber: 3 }),
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffMatches);
        return Promise.resolve([]);
      });

      const config = createMockConfig({ getStyle: 'grouped' }); // flag off
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      /* No BM-specific repair should fire — verify no updateMany was scoped
       * to startingCourseNumber. (Other normalize functions for cup/courses
       * may still run if their flags are on, but those aren't enabled here.) */
      const startingCourseWrites = (prisma.bMMatch as any).updateMany.mock.calls.filter(
        (c: any[]) => c[0]?.data?.startingCourseNumber !== undefined,
      );
      expect(startingCourseWrites).toHaveLength(0);
    });

    it('should return 500 on database error', async () => {
      // Mock paginate to reject with error for paginated getStyle
      mockPaginate.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig({ getErrorMessage: 'Custom error message' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Custom error message');
      expect(mockLogger.error).toHaveBeenCalledWith('Custom error message', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });

    it('should parse tournamentId from params correctly', async () => {
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        if (typeof args?.where?.stage === 'object') return Promise.resolve([]);
        return Promise.resolve([createMockMatch()]);
      });

      const config = createMockConfig({ getStyle: 'simple' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-999' }),
      });

      expect(response.status).toBe(200);
      /* The handler now makes two findMany calls: first for playoff stage,
       * then for finals stage. Verify both use the correct tournamentId. */
      const calls = (prisma.bMMatch as any).findMany.mock.calls;
      for (const call of calls) {
        expect(call[0].where.tournamentId).toBe('tournament-999');
      }
    });

    it('should include config.getErrorMessage in error response', async () => {
      // Mock paginate to reject with error for paginated getStyle
      mockPaginate.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig({ getErrorMessage: 'Failed to fetch BM finals' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to fetch BM finals');
    });

    it('should include playoff data in grouped GET response when playoff matches exist', async () => {
      const mockFinalsMatches = [createMockMatch({ round: 'winners_qf' })];
      /* 4 completed R2 playoff matches to satisfy playoffComplete=true */
      const mockPlayoffMatches = [
        createMockMatch({ matchNumber: 1, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 2, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 3, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 4, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 5, round: 'playoff_r2', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 6, round: 'playoff_r2', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 7, round: 'playoff_r2', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 8, round: 'playoff_r2', stage: 'playoff', completed: true }),
      ];

      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(mockPlayoffMatches);
        if (typeof args?.where?.stage === 'object') return Promise.resolve([]);
        return Promise.resolve(mockFinalsMatches);
      });
      /* No finals matches exist → phase should be 'playoff' */
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.playoffMatches).toHaveLength(mockPlayoffMatches.length);
      expect(
        json.data.playoffMatches.every((match: any) => match.player1Tbd === false && match.player2Tbd === false),
      ).toBe(true);
      expect(json.data.playoffStructure).toBeDefined();
      expect(json.data.playoffStructure.length).toBe(8);
      expect(json.data.playoffSeededPlayers).toBeDefined();
      expect(json.data.playoffSeededPlayers.length).toBeGreaterThan(0);
      expect(json.data.phase).toBe('playoff');
      expect(json.data.playoffComplete).toBe(true);
    });

    it('should preview Top-24 Upper Bracket using paper-layout barrage slots after reset', async () => {
      const mockQualifications = ['A', 'B'].flatMap((group) =>
        Array.from({ length: 12 }, (_, index) => {
          const rank = index + 1;
          const playerId = `${group}${rank}`;
          return {
            id: `qual-${playerId}`,
            playerId,
            group,
            score: 100 - rank,
            points: 100 - rank,
            player: { id: playerId, name: playerId },
          };
        }),
      );
      (prisma.bMQualification as any).findMany.mockResolvedValue(mockQualifications);

      const mockPlayoffMatches = [
        ...Array.from({ length: 4 }, (_, i) =>
          createMockMatch({
            matchNumber: i + 1,
            round: 'playoff_r1',
            stage: 'playoff',
            completed: true,
          }),
        ),
        createMockMatch({
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'W16',
          player2Id: 'x',
          player1: { id: 'W16', name: 'W16' },
          player2: { id: 'x' },
        }),
        createMockMatch({
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'W13',
          player2Id: 'x',
          player1: { id: 'W13', name: 'W13' },
          player2: { id: 'x' },
        }),
        createMockMatch({
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'W15',
          player2Id: 'x',
          player1: { id: 'W15', name: 'W15' },
          player2: { id: 'x' },
        }),
        createMockMatch({
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'W14',
          player2Id: 'x',
          player1: { id: 'W14', name: 'W14' },
          player2: { id: 'x' },
        }),
      ];

      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(mockPlayoffMatches);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      const seedMap = new Map(
        json.data.seededPlayers.map((p: { seed: number; playerId: string }) => [p.seed, p.playerId]),
      );
      const winnersR1 = json.data.bracketStructure.filter((m: { round: string }) => m.round === 'winners_r1');
      const pairLabels = winnersR1.map((m: { player1Seed: number; player2Seed: number }) => [
        seedMap.get(m.player1Seed),
        seedMap.get(m.player2Seed),
      ]);
      /* Contiguous bucket-stacked seeding (finals-group-selection.ts): direct
       * seeds 1-12 interleave A1,B1,A2,B2,...; barrage byes keep their own
       * seed 13-16 when they win (double-elimination.ts). Verified against
       * the CDM 2025 official results workbook. */
      expect(pairLabels).toEqual([
        ['A1', 'W16'],
        ['B4', 'A5'],
        ['B2', 'W13'],
        ['A3', 'B6'],
        ['B1', 'W15'],
        ['A4', 'B5'],
        ['A2', 'W14'],
        ['B3', 'A6'],
      ]);
    });

    it('should include playoff data in paginated GET response when playoff matches exist', async () => {
      const mockPlayoffMatches = [
        createMockMatch({ matchNumber: 1, round: 'playoff_r1', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 2, round: 'playoff_r1', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 3, round: 'playoff_r1', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 4, round: 'playoff_r1', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 5, round: 'playoff_r2', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 6, round: 'playoff_r2', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 7, round: 'playoff_r2', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 8, round: 'playoff_r2', stage: 'playoff', completed: false }),
      ];

      (prisma.bMMatch as any).findMany.mockResolvedValue(mockPlayoffMatches);
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        bmQualificationConfirmed: false,
        mrQualificationConfirmed: false,
        gpQualificationConfirmed: false,
        bmFinalsSeedSnapshot: Array.from({ length: 24 }, (_, index) => ({
          seed: index + 1,
          originalSeed: index + 1,
          playerId: `p${index + 1}`,
          player: { id: `p${index + 1}` },
        })),
      });
      /* No finals matches exist → phase should be 'playoff' */
      (prisma.bMMatch as any).count.mockResolvedValue(0);
      mockPaginate.mockResolvedValue({
        data: [createMockMatch()],
        meta: { total: 17, page: 1, limit: 50, totalPages: 1 },
      });

      const config = createMockConfig({ getStyle: 'paginated' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.playoffMatches).toHaveLength(mockPlayoffMatches.length);
      expect(
        json.data.playoffMatches
          .filter((match: any) => match.round === 'playoff_r2')
          .every((match: any) => match.player2Id === null && match.player2Tbd),
      ).toBe(true);
      expect(json.data.playoffStructure).toBeDefined();
      expect(json.data.phase).toBe('playoff');
      expect(json.data.playoffComplete).toBe(false);
    });

    it('should include playoff data in simple GET response when playoff matches exist', async () => {
      const mockFinalsMatches = [createMockMatch()];
      const mockPlayoffMatches = [
        createMockMatch({ matchNumber: 1, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 2, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 3, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 4, round: 'playoff_r1', stage: 'playoff', completed: true }),
        createMockMatch({ matchNumber: 5, round: 'playoff_r2', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 6, round: 'playoff_r2', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 7, round: 'playoff_r2', stage: 'playoff', completed: false }),
        createMockMatch({ matchNumber: 8, round: 'playoff_r2', stage: 'playoff', completed: false }),
      ];

      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(mockPlayoffMatches);
        if (typeof args?.where?.stage === 'object') return Promise.resolve([]);
        return Promise.resolve(mockFinalsMatches);
      });
      /* Finals matches exist → phase should be 'finals' */
      (prisma.bMMatch as any).count.mockResolvedValue(17);

      const config = createMockConfig({ getStyle: 'simple' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.playoffMatches).toHaveLength(mockPlayoffMatches.length);
      expect(
        json.data.playoffMatches.every((match: any) => match.player1Tbd === false && match.player2Tbd === false),
      ).toBe(true);
      expect(json.data.playoffStructure).toBeDefined();
      expect(json.data.phase).toBe('finals');
      expect(json.data.playoffComplete).toBe(false);
    });
  });

  // ============================================================
  // POST Handler Tests (7 cases)
  // ============================================================

  describe('POST Handler', () => {
    const createMockQualifications = (count = 8) =>
      Array.from({ length: count }, (_, i) => ({
        id: `qual-${i}`,
        playerId: `player-${i}`,
        group: 'A',
        score: count - i,
        points: count - i,
        seeding: i + 1,
        player: { id: `player-${i}`, name: `Player ${i + 1}` },
      }));

    it('should create bracket successfully when postRequiresAuth is true and user is admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(8));
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      // Issue #420: bracket inserted in a single createMany; the inserted rows
      // are then re-fetched with includes via findMany for the response shape.
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({ postRequiresAuth: true });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      expect((prisma.bMMatch as any).deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals' },
      });
    });

    it('should skip auth check when postRequiresAuth is false', async () => {
      mockAuth.mockResolvedValue(null);
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(8));
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({ postRequiresAuth: false });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
    });

    it('should create 8-player bracket when topN is 8', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(8));
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(8);
      // Issue #420: all 17 bracket matches are inserted in one createMany call
      expect((prisma.bMMatch as any).createMany).toHaveBeenCalledTimes(1);
      const call = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      expect(call.data).toHaveLength(17);
      const nonOpeningSlots = call.data.filter((match: any) => match.round !== 'winners_qf');
      expect(nonOpeningSlots.every((match: any) => match.player1Id === null && match.player2Id === null)).toBe(true);
      expect(call.data.every((match: any) => !(match.player1Id && match.player1Id === match.player2Id))).toBe(true);
    });

    it('uses finalized qualification ranks when seeding the bracket', async () => {
      const qualifications = createMockQualifications(8).map((q, index) => ({
        ...q,
        rankOverride: index === 7 ? 1 : index + 2,
      }));
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.seededPlayers[0].playerId).toBe('player-7');
    });

    it('uses finalized qualification ranks when seeding a 16-player bracket', async () => {
      const qualifications = createMockQualifications(16).map((q, index) => ({
        ...q,
        rankOverride: index === 15 ? 1 : index + 2,
      }));
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 16 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16);
      const json = await response.json();
      expect(json.data.seededPlayers[0].playerId).toBe('player-15');

      const createManyCall = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      const openingMatches = createManyCall.data.filter((match: any) => match.round === 'winners_r1');
      const unresolvedMatches = createManyCall.data.filter((match: any) => match.round !== 'winners_r1');
      expect(openingMatches).toHaveLength(8);
      expect(unresolvedMatches.every((match: any) => match.player1Id === null && match.player2Id === null)).toBe(true);
      expect(createManyCall.data.every((match: any) => !(match.player1Id && match.player1Id === match.player2Id))).toBe(
        true,
      );
    });

    it('prioritizes rankOverride over equal group-local ranks when seeding a 16-player bracket', async () => {
      const qualifications = Array.from({ length: 16 }, (_, index) => {
        const group = index < 8 ? 'A' : 'B';
        const groupIndex = index % 8;
        return {
          id: `qual-${index}`,
          playerId: `player-${index}`,
          group,
          score: 8 - groupIndex,
          points: 8 - groupIndex,
          rankOverride: index === 15 ? 1 : null,
          player: { id: `player-${index}`, name: `Player ${index + 1}` },
        };
      });
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({
        qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
      });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 16 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.seededPlayers[0].playerId).toBe('player-15');
    });

    it('uses the latest manual rankOverride when duplicate override ranks collide', async () => {
      const earlyOverride = new Date('2026-01-01T00:00:00Z');
      const latestOverride = new Date('2026-01-02T00:00:00Z');
      const qualifications = Array.from({ length: 16 }, (_, index) => {
        const group = index < 8 ? 'A' : 'B';
        const groupIndex = index % 8;
        return {
          id: `qual-${index}`,
          playerId: `player-${index}`,
          group,
          score: 8 - groupIndex,
          points: 8 - groupIndex,
          rankOverride: index === 0 || index === 15 ? 1 : null,
          rankOverrideAt: index === 0 ? earlyOverride : index === 15 ? latestOverride : null,
          player: { id: `player-${index}`, name: `Player ${index + 1}` },
        };
      });
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({
        qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
      });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 16 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.seededPlayers[0].playerId).toBe('player-15');
    });

    it('sorts by rankOverride value ascending when both players have rankOverride set (score/points tied)', async () => {
      // player-0: rankOverride=1 (wins) + earliestOverride; player-1: rankOverride=2 (loses) + latestOverride — opposing directions prove rankOverride value beats timestamp.
      const latestOverride = new Date('2026-01-02T00:00:00Z');
      const earliestOverride = new Date('2026-01-01T00:00:00Z');
      const qualifications = Array.from({ length: 16 }, (_, index) => ({
        id: `qual-${index}`,
        playerId: `player-${index}`,
        group: 'A',
        score: 10,
        points: 10,
        rankOverride: index === 0 ? 1 : index === 1 ? 2 : null,
        rankOverrideAt: index === 0 ? earliestOverride : index === 1 ? latestOverride : null,
        player: { id: `player-${index}`, name: `Player ${index + 1}` },
      }));
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({
        qualificationOrderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 16 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.seededPlayers[0].playerId).toBe('player-0');
    });

    it('falls back to latest rankOverrideAt timestamp when both players share the same rankOverride value', async () => {
      // Both player-0 and player-1 have rankOverride=1 (collision); player-1 has later rankOverrideAt.
      // Verifies the timestamp tie-breaker: the most-recent correction wins the seed.
      const earliestOverride = new Date('2026-01-01T00:00:00Z');
      const latestOverride = new Date('2026-01-02T00:00:00Z');
      const qualifications = Array.from({ length: 16 }, (_, index) => ({
        id: `qual-${index}`,
        playerId: `player-${index}`,
        group: 'A',
        score: 10,
        points: 10,
        rankOverride: index === 0 || index === 1 ? 1 : null,
        rankOverrideAt: index === 0 ? earliestOverride : index === 1 ? latestOverride : null,
        player: { id: `player-${index}`, name: `Player ${index + 1}` },
      }));
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({
        qualificationOrderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 16 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.seededPlayers[0].playerId).toBe('player-1');
    });

    it('does not fetch H2H matches when qualificationOrderBy is empty', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(8));
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig({ qualificationOrderBy: [] });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const h2hFetch = (prisma.bMMatch as any).findMany.mock.calls.find(
        ([args]) => args?.where?.stage === 'qualification',
      );
      expect(h2hFetch).toBeUndefined();
    });

    it('should still create bracket after qualification is confirmed', async () => {
      (prisma.tournament as any).findUnique.mockResolvedValue({
        id: 'tournament-123',
        name: 'Test Tournament',
        bmQualificationConfirmed: true,
      });
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(8));
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      expect((prisma.bMMatch as any).createMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['bm', 'bMMatch', 'bMQualification', 'bmQualificationConfirmed'],
      ['mr', 'mRMatch', 'mRQualification', 'mrQualificationConfirmed'],
      ['gp', 'gPMatch', 'gPQualification', 'gpQualificationConfirmed'],
    ] as const)(
      'should reject %s bracket reset while qualification is locked',
      async (eventTypeCode, matchModel, qualificationModel, flag) => {
        (prisma.tournament as any).findUnique.mockResolvedValue({
          id: 'tournament-123',
          bmQualificationConfirmed: false,
          mrQualificationConfirmed: false,
          gpQualificationConfirmed: false,
          [flag]: true,
        });

        const config = createMockConfig({
          eventTypeCode,
          matchModel,
          qualificationModel,
        });
        const { POST } = createFinalsHandlers(config);

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          body: JSON.stringify({ reset: true }),
        });
        const response = await POST(request, {
          params: Promise.resolve({ id: 'tournament-123' }),
        });

        expect(response.status).toBe(409);
        const json = await response.json();
        expect(json).toMatchObject({
          success: false,
          error: 'Cannot reset bracket while qualification is locked',
          code: 'QUALIFICATION_LOCKED',
        });
        expect((prisma[matchModel] as any).deleteMany).not.toHaveBeenCalled();
      },
    );

    it('should return 400 when topN is not 8', async () => {
      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 4 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported');
    });

    it('should return 400 when not enough players qualified', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(6)); // Only 6 qualified

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Not enough players qualified. Need 8, found 6');
    });

    it('should return 403 when postRequiresAuth and user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const config = createMockConfig({ postRequiresAuth: true });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('should return 500 on database error', async () => {
      (prisma.bMQualification as any).findMany.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig({ postErrorMessage: 'Failed to create BM finals bracket' });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to create BM finals bracket');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create finals', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });

    it('should sanitize body when sanitizePostBody is true', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(8));
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 17 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);
      mockSanitizeInput.mockReturnValue({ topN: 8 });

      const config = createMockConfig({ sanitizePostBody: true });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 8 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(mockSanitizeInput).toHaveBeenCalled();
      expect(response.status).toBe(201);
    });
  });

  // ============================================================
  // POST Handler — Top 24 Playoff Flow (issue #454)
  // ============================================================

  describe('POST Handler — Top 24 Playoff', () => {
    /* Top-24 creates a pre-bracket playoff in Phase 1 (from qual 13-24) and
     * then, on a second POST call, builds the 16-player Upper Bracket in
     * Phase 2 (qual top-12 + 4 playoff winners). Each test exercises one
     * of those transitions or their guard rails. */

    /**
     * Build mock qualifications split across groups (default 2 groups × 12 players).
     * The returned array is ordered (group asc, within-group rank asc) — matching
     * qualificationOrderBy = [{ group: 'asc' }, { score: 'desc' }, ...].
     *
     * Player ID mapping (2-group default):
     *   group 'A' rank 1..12 → player-0..player-11
     *   group 'B' rank 1..12 → player-12..player-23
     * This makes "top-12 qualifiers" (player-0..player-11) span group A entirely,
     * which matches the original absolute-ranking tests' intuition while satisfying
     * the per-group split required by #454.
     */
    const createMockQualifications = (count = 24, groupCount = 2) => {
      const perGroup = Math.ceil(count / groupCount);
      const groupLetters = ['A', 'B', 'C', 'D'];
      return Array.from({ length: count }, (_, i) => {
        const groupIdx = Math.floor(i / perGroup);
        const groupRank = (i % perGroup) + 1;
        return {
          id: `qual-${i}`,
          playerId: `player-${i}`,
          group: groupLetters[Math.min(groupIdx, groupCount - 1)],
          score: perGroup - groupRank,
          points: perGroup - groupRank,
          seeding: groupRank,
          player: { id: `player-${i}`, name: `Player ${i + 1}` },
        };
      });
    };

    it('Phase 1: creates 8 playoff matches when no playoff exists yet', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      /* No existing playoff rows → triggers Phase 1 creation.
       * Implementation uses createMany (#703) then re-fetches via findMany for the
       * response shape. Three findMany calls in sequence:
       *   1. existingPlayoff check  → []   (triggers Phase 1)
       *   2. existingFinals check   → []   (not a reset)
       *   3. post-createMany lookup → 8 rows */
      const expectedPlayoffRows = Array.from({ length: 8 }, (_, i) => ({
        id: `playoff-${i + 1}`,
        matchNumber: i + 1,
        stage: 'playoff',
        round: i < 4 ? 'playoff_r1' : 'playoff_r2',
        tournamentId: 'tournament-123',
        player1: { id: `p-barrage-${i}` },
        player2: { id: `p-barrage-${i}` },
        completed: false,
        score1: 0,
        score2: 0,
      }));
      (prisma.bMMatch as any).findMany
        .mockResolvedValueOnce([]) // existingPlayoff
        .mockResolvedValueOnce([]) // existingFinals
        .mockResolvedValueOnce(expectedPlayoffRows); // post-createMany
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 8 });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.phase).toBe('playoff');
      expect(json.data.playoffMatches).toHaveLength(8);
      /* Verifies 8 matches were bulk-inserted via a single createMany call
       * (issue #703: replaces 8 sequential creates). All rows must have stage='playoff'. */
      expect((prisma.bMMatch as any).createMany).toHaveBeenCalledTimes(1);
      const createManyCall = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(8);
      const createdStages = createManyCall.data.map((d: { stage: string }) => d.stage);
      expect(createdStages.every((s: string) => s === 'playoff')).toBe(true);
      /* The two-group displayed-seed order alternates A/B by group rank. */
      expect(json.data.playoffSeededPlayers.map((p: { playerId: string }) => p.playerId)).toEqual([
        'player-6',
        'player-18',
        'player-7',
        'player-19',
        'player-8',
        'player-20',
        'player-9',
        'player-21',
        'player-10',
        'player-22',
        'player-11',
        'player-23',
      ]);
      expect(mockGeneratePlayoffStructure).toHaveBeenCalledWith(12, 2);
      /* Per issue #454 the barrage pool = each group's rank 7..12.
       * Top-6 of each group (A: player-0..5, B: player-12..17) must NOT appear
       * as player1 in any playoff match — they advance directly to the Upper
       * Bracket. Top 7-12 of each group (player-6..11, player-18..23) are the
       * pool from which playoff player1Id values are drawn. */
      const createdPlayerIds = createManyCall.data.map((d: { player1Id: string }) => d.player1Id);
      const directAdvancers = [
        'player-0',
        'player-1',
        'player-2',
        'player-3',
        'player-4',
        'player-5',
        'player-12',
        'player-13',
        'player-14',
        'player-15',
        'player-16',
        'player-17',
      ];
      expect(createdPlayerIds.some((id: string) => directAdvancers.includes(id))).toBe(false);
    });

    it('returns 400 when fewer than 24 qualifiers exist', async () => {
      /* Top-24 is only viable when 24 players have completed qualification;
       * otherwise we refuse to create a partial/ambiguous bracket. */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(20));

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Not enough players qualified. Need 24, found 20');
      expect((prisma.bMMatch as any).create).not.toHaveBeenCalled();
    });

    it('Phase 1 (3 groups): creates 8 playoff matches using bucket-stacked contiguous seed placement', async () => {
      /* 3-group Top-24 creation is supported per
       * docs/qualification-combined-ranking.md §2-§3, §7. createMockQualifications(27, 3)
       * ties every player's score to their raw rank only (not group), so group
       * letter order (A,B,C) breaks ties -- matching the fixture used in
       * __tests__/lib/finals-group-selection.test.ts ("3-group case (A=9, B=9, C=9)"),
       * just with player-N ids instead of A1/B1/C1 labels: group A = player-0..8,
       * B = player-9..17, C = player-18..26. */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(27, 3));
      const expectedPlayoffRows = Array.from({ length: 8 }, (_, i) => ({
        id: `playoff-${i + 1}`,
        matchNumber: i + 1,
        stage: 'playoff',
        round: i < 4 ? 'playoff_r1' : 'playoff_r2',
        tournamentId: 'tournament-123',
        player1: { id: `p-barrage-${i}` },
        player2: { id: `p-barrage-${i}` },
        completed: false,
        score1: 0,
        score2: 0,
      }));
      (prisma.bMMatch as any).findMany
        .mockResolvedValueOnce([]) // existingPlayoff
        .mockResolvedValueOnce([]) // existingFinals
        .mockResolvedValueOnce(expectedPlayoffRows); // post-createMany
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 8 });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.phase).toBe('playoff');
      /* Playoff seed order (barrageSeeds[] from selectFinalsEntrantsByGroup):
       * bucket-stacked across each group's rank 5-8 (A5,B5,C5,A6,B6,C6,...),
       * assigned seeds 13-24 in that order -- ties broken alphabetically by
       * group (A,B,C) since every player's score is tied to raw rank only. */
      expect(json.data.playoffSeededPlayers.map((p: { playerId: string }) => p.playerId)).toEqual([
        'player-4',
        'player-13',
        'player-22',
        'player-5',
        'player-14',
        'player-23',
        'player-6',
        'player-15',
        'player-24',
        'player-7',
        'player-16',
        'player-25',
      ]);
      /* Direct advancers (each group's rank 1-4: A=player-0..3, B=player-9..12,
       * C=player-18..21) must never appear in the playoff pool. */
      const createManyCall = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      const createdPlayerIds = createManyCall.data.map((d: { player1Id: string }) => d.player1Id);
      const directAdvancers = [
        'player-0',
        'player-1',
        'player-2',
        'player-3',
        'player-9',
        'player-10',
        'player-11',
        'player-12',
        'player-18',
        'player-19',
        'player-20',
        'player-21',
      ];
      expect(createdPlayerIds.some((id: string) => directAdvancers.includes(id))).toBe(false);
    });

    it('returns 400 for 4-group Top-24 because only up to 3 groups are supported', async () => {
      /* 4+ groups are out of scope for now (docs/qualification-combined-ranking.md
       * §7: only 2 and 3 groups were confirmed with tournament operations). */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(32, 4));

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Top-24 playoff currently supports at most 3 qualification groups; found 4');
      expect(json.details).toEqual({ field: 'qualifications' });
      expectNoBmMatchWrites();
    });

    it('returns 400 for 1-group Top-24 before creating playoff rows', async () => {
      /* Issue #1603: the explicit 3+ group guard should not hide the separate
       * selection-layer contract. Top-24 still needs at least two qualification
       * groups, and the API must surface that validation failure without writes. */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24, 1));

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('selectFinalsEntrantsByGroup: Unsupported group count 1 (must be 2, 3, or 4)');
      expect(json.details).toEqual({ field: 'qualifications' });
      expectNoBmMatchWrites();
    });

    it('Phase 2 blocked: returns 409 when playoff R2 matches are still incomplete', async () => {
      /* Second POST after Phase 1 must wait until all 4 playoff_r2 matches
       * are completed. If the admin tries to jump ahead, we return
       * PLAYOFF_INCOMPLETE with a hint on how many matches remain. */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      const incompletePlayoff = [
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `p-r1-${i}`,
          matchNumber: i + 1,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: `player-${12 + i}`,
          player2Id: `player-${20 + i}`,
        })),
        /* Only 2 of 4 R2 matches completed → Phase 2 cannot start. */
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'x',
          player2Id: 'y',
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: false,
          score1: 0,
          score2: 0,
          player1Id: 'x',
          player2Id: 'y',
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'x',
          player2Id: 'y',
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: false,
          score1: 0,
          score2: 0,
          player1Id: 'x',
          player2Id: 'y',
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'finals') return Promise.resolve([]);
        return Promise.resolve(incompletePlayoff);
      });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe('PLAYOFF_INCOMPLETE');
      expect(json.error).toMatch(/2 R2 match\(es\) remaining/);
      expect((prisma.bMMatch as any).create).not.toHaveBeenCalled();
    });

    it('Phase 2: builds 16-player finals bracket from qual top-12 + 4 playoff winners', async () => {
      /* All 4 playoff_r2 matches completed with player1 winning each time.
       * A bye winner keeps their own seed number in the Upper Bracket
       * (double-elimination.ts), so the R2 match → Upper seed mapping is just
       * each match's own advancesToUpperSeed:
       *   match 5 → Upper seed 16 (winner = player-19)
       *   match 6 → Upper seed 13 (winner = player-6)
       *   match 7 → Upper seed 15 (winner = player-7)
       *   match 8 → Upper seed 14 (winner = player-18). */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      const playoffRows = [
        /* R1 rows — completed but irrelevant to seat assignment (R2 winners
         * are what we consume). */
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `p-r1-${i}`,
          matchNumber: i + 1,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: ['player-8', 'player-21', 'player-20', 'player-9'][i],
          player2Id: ['player-23', 'player-10', 'player-11', 'player-22'][i],
          player1: { id: ['player-8', 'player-21', 'player-20', 'player-9'][i] },
          player2: { id: ['player-23', 'player-10', 'player-11', 'player-22'][i] },
        })),
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-6',
          player2Id: 'player-21',
          player1: { id: 'player-6' },
          player2: { id: 'player-21' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-7',
          player2Id: 'player-20',
          player1: { id: 'player-7' },
          player2: { id: 'player-20' },
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-18',
          player2Id: 'player-9',
          player1: { id: 'player-18' },
          player2: { id: 'player-9' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'finals') return Promise.resolve([]);
        return Promise.resolve(playoffRows);
      });
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      /* Phase 2 uses createMany (#703) then re-fetches via findMany.
       * Finals findMany returns [] here; seededPlayers is validated separately. */
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.phase).toBe('finals');
      /* Phase 2 resolves playoff winners into seeded player payloads. The real
       * D1 query must therefore include both player relations; otherwise stored
       * scores alone identify winnerId but cannot provide the public player
       * object required by seededPlayers. */
      expect((prisma.bMMatch as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-123', stage: 'playoff' },
          include: {
            player1: { select: expect.any(Object) },
            player2: { select: expect.any(Object) },
          },
        }),
      );
      /* 16-player bracket generator is invoked once we have 4 playoff winners. */
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16, 2);
      /* Existing finals (if any) must be cleared before Phase-2 creation —
       * this supports reset scenarios where Phase-2 is retried. */
      expect((prisma.bMMatch as any).deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals' },
      });
      /* A barrage survivor retains its R2 bye seed as the Upper slot. */
      const seededPlayers: Array<{ seed: number; playerId: string }> = json.data.seededPlayers;
      const seedMap = new Map(seededPlayers.map((p) => [p.seed, p.playerId]));
      expect(seedMap.get(16)).toBe('player-19'); /* From playoff R2 match 5 */
      expect(seedMap.get(13)).toBe('player-6'); /* From playoff R2 match 6 */
      expect(seedMap.get(15)).toBe('player-7'); /* From playoff R2 match 7 */
      expect(seedMap.get(14)).toBe('player-18'); /* From playoff R2 match 8 */
      /* Direct-advance qualifiers occupy the official alternating Upper slots. */
      expect(seedMap.get(1)).toBe('player-0'); /* A1 */
      expect(seedMap.get(2)).toBe('player-12'); /* B1 */
      expect(seedMap.get(3)).toBe('player-1'); /* A2 */
      expect(seedMap.get(11)).toBe('player-5'); /* A6 */
      expect(seedMap.get(12)).toBe('player-17'); /* B6 */
      /* A barrage winner is routed to Upper slot 16, but keeps the displayed
       * qualification seed assigned by the fixed two-group barrage layout. */
      expect(seededPlayers.find((player) => player.seed === 16)).toEqual(
        expect.objectContaining({ playerId: 'player-19', originalSeed: 16 }),
      );

      const structure = json.data.bracketStructure.filter((m: { round: string }) => m.round === 'winners_r1');
      const pairLabels = structure.map((m: { player1Seed: number; player2Seed: number }) => [
        seedMap.get(m.player1Seed),
        seedMap.get(m.player2Seed),
      ]);
      expect(pairLabels).toEqual([
        ['player-0', 'player-19'] /* A1 vs barrage(seed16) */,
        ['player-15', 'player-4'] /* B4 vs A5 */,
        ['player-13', 'player-6'] /* B2 vs barrage(seed13) */,
        ['player-2', 'player-17'] /* A3 vs B6 */,
        ['player-12', 'player-7'] /* B1 vs barrage(seed15) */,
        ['player-3', 'player-16'] /* A4 vs B5 */,
        ['player-1', 'player-18'] /* A2 vs barrage(seed14) */,
        ['player-14', 'player-5'] /* B3 vs A6 */,
      ]);
    });

    it('Phase 2 (3 groups): builds 16-player finals bracket with contiguous bucket-stacked seeds', async () => {
      /* 3-group counterpart to the 2-group Phase 2 test above. Uses the same
       * createMockQualifications(27, 3) fixture as the "Phase 1 (3 groups)"
       * test, so the direct-advancer seed map (contiguous seeds 1-12) and the
       * barrage seed map (13-16) are derived the same way from this file's
       * mocked generateBracketStructure(16) / generatePlayoffStructure(12) --
       * see that test's comment for the player-N -> group mapping (A=0-8,
       * B=9-17, C=18-26). */
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(27, 3));
      const playoffRows = [
        /* R1 rows — completed but irrelevant to seat assignment (R2 winners
         * are what we consume). Pairs mirror the barrage seed map: 8v9,
         * 5v12, 6v11, 7v10 in playoff-local seed numbers. */
        {
          id: 'p-r1-0',
          matchNumber: 1,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-16',
          player2Id: 'player-25',
          player1: { id: 'player-16' },
          player2: { id: 'player-25' },
        },
        {
          id: 'p-r1-1',
          matchNumber: 2,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-14',
          player2Id: 'player-23',
          player1: { id: 'player-14' },
          player2: { id: 'player-23' },
        },
        {
          id: 'p-r1-2',
          matchNumber: 3,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-6',
          player2Id: 'player-15',
          player1: { id: 'player-6' },
          player2: { id: 'player-15' },
        },
        {
          id: 'p-r1-3',
          matchNumber: 4,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-24',
          player2Id: 'player-7',
          player1: { id: 'player-24' },
          player2: { id: 'player-7' },
        },
        /* R2: the BYE-seeded player (1/4/3/2, always player1 here) wins each
         * time, so the playoff's solo BYE seed advances to the Upper seed
         * declared by advancesToUpperSeed. */
        {
          id: 'p-r2-4',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-4',
          player2Id: 'player-16',
          player1: { id: 'player-4' },
          player2: { id: 'player-16' },
        },
        {
          id: 'p-r2-5',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-5',
          player2Id: 'player-14',
          player1: { id: 'player-5' },
          player2: { id: 'player-14' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-22',
          player2Id: 'player-6',
          player1: { id: 'player-22' },
          player2: { id: 'player-6' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-13',
          player2Id: 'player-24',
          player1: { id: 'player-13' },
          player2: { id: 'player-24' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'finals') return Promise.resolve([]);
        return Promise.resolve(playoffRows);
      });
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data.phase).toBe('finals');
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16, 3);

      const seededPlayers: Array<{ seed: number; playerId: string }> = json.data.seededPlayers;
      const seedMap = new Map(seededPlayers.map((p) => [p.seed, p.playerId]));
      /* Direct advancers (each group's rank 1-4) occupy contiguous seeds 1-12,
       * bucket-stacked A1,B1,C1,A2,B2,C2,... (tied scores in this fixture, so
       * stable sort keeps group A before B before C). */
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => seedMap.get(seed))).toEqual([
        'player-0' /* A1 */,
        'player-9' /* B1 */,
        'player-18' /* C1 */,
        'player-1' /* A2 */,
        'player-10' /* B2 */,
        'player-19' /* C2 */,
        'player-2' /* A3 */,
        'player-11' /* B3 */,
        'player-20' /* C3 */,
        'player-3' /* A4 */,
        'player-12' /* B4 */,
        'player-21' /* C4 */,
      ]);
      /* Barrage-fed seeds 13-16 come from the playoff R2 winners, keeping
       * their own bye seed number. */
      expect(seedMap.get(16)).toBe('player-4'); /* From playoff R2 match 5 */
      expect(seedMap.get(13)).toBe('player-5'); /* From playoff R2 match 6 */
      expect(seedMap.get(15)).toBe('player-22'); /* From playoff R2 match 7 */
      expect(seedMap.get(14)).toBe('player-13'); /* From playoff R2 match 8 */

      const structure = json.data.bracketStructure.filter((m: { round: string }) => m.round === 'winners_r1');
      const pairLabels = structure.map((m: { player1Seed: number; player2Seed: number }) => [
        seedMap.get(m.player1Seed),
        seedMap.get(m.player2Seed),
      ]);
      /* No anti-collision guarantee: matches 1 [1,16] and 6 [7,10] are both
       * same-group (A vs A) here, matching the real CDM 2025 event where
       * same-group Winners R1 matchups did occur (e.g. Drew vs Zarkov). */
      expect(pairLabels).toEqual([
        ['player-0', 'player-4'] /* [1,16]: A1 vs barrage(A5) */,
        ['player-11', 'player-20'] /* [8,9]: B3 vs C3 */,
        ['player-1', 'player-5'] /* [4,13]: A2 vs barrage */,
        ['player-10', 'player-21'] /* [5,12]: B2 vs C4 */,
        ['player-9', 'player-22'] /* [2,15]: B1 vs barrage */,
        ['player-2', 'player-3'] /* [7,10]: A3 vs A4 */,
        ['player-18', 'player-13'] /* [3,14]: C1 vs barrage */,
        ['player-19', 'player-12'] /* [6,11]: C2 vs B4 */,
      ]);
    });

    it('Phase 2 fails fast when the malformed playoff structure is missing R2 upper seeds', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      mockGeneratePlayoffStructure.mockReturnValue([
        {
          matchNumber: 1,
          round: 'playoff_r1',
          bracket: 'winners',
          player1Seed: 8,
          player2Seed: 9,
          winnerGoesTo: 5,
          position: 2,
        },
        {
          matchNumber: 2,
          round: 'playoff_r1',
          bracket: 'winners',
          player1Seed: 5,
          player2Seed: 12,
          winnerGoesTo: 6,
          position: 2,
        },
        {
          matchNumber: 3,
          round: 'playoff_r1',
          bracket: 'winners',
          player1Seed: 6,
          player2Seed: 11,
          winnerGoesTo: 7,
          position: 2,
        },
        {
          matchNumber: 4,
          round: 'playoff_r1',
          bracket: 'winners',
          player1Seed: 7,
          player2Seed: 10,
          winnerGoesTo: 8,
          position: 2,
        },
        { matchNumber: 5, round: 'playoff_r2', bracket: 'winners', player1Seed: 1 },
        { matchNumber: 6, round: 'playoff_r2', bracket: 'winners', player1Seed: 4 },
        { matchNumber: 7, round: 'playoff_r2', bracket: 'winners', player1Seed: 3 },
        { matchNumber: 8, round: 'playoff_r2', bracket: 'winners', player1Seed: 2 },
      ]);
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-6',
          player2Id: 'player-21',
          player1: { id: 'player-6' },
          player2: { id: 'player-21' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-7',
          player2Id: 'player-20',
          player1: { id: 'player-7' },
          player2: { id: 'player-20' },
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-18',
          player2Id: 'player-9',
          player1: { id: 'player-18' },
          player2: { id: 'player-9' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'finals') return Promise.resolve([]);
        return Promise.resolve(playoffRows);
      });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const response = await POST(
        new NextRequest('http://localhost:3000', {
          method: 'POST',
          body: JSON.stringify({ topN: 24 }),
        }),
        {
          params: Promise.resolve({ id: 'tournament-123' }),
        },
      );

      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create Top-24 finals', {
        error: expect.objectContaining({
          message: 'Expected 4 playoff R2 upper seeds, got 0',
        }),
        tournamentId: 'tournament-123',
      });
      expect((prisma.bMMatch as any).createMany).not.toHaveBeenCalled();
    });

    it('Phase 2: derives playoff winners from configured score fields for GP-style routes', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      const playoffRows = [
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `p-r1-${i}`,
          matchNumber: i + 1,
          round: 'playoff_r1',
          stage: 'playoff',
          completed: true,
          points1: 1,
          points2: 0,
          score1: 0,
          score2: 9,
          player1Id: ['player-8', 'player-21', 'player-20', 'player-9'][i],
          player2Id: ['player-23', 'player-10', 'player-11', 'player-22'][i],
          player1: { id: ['player-8', 'player-21', 'player-20', 'player-9'][i] },
          player2: { id: ['player-23', 'player-10', 'player-11', 'player-22'][i] },
        })),
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          points1: 0,
          points2: 4,
          score1: 9,
          score2: 0,
          player1Id: 'loser-16',
          player2Id: 'winner-16',
          player1: { id: 'loser-16' },
          player2: { id: 'winner-16' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          points1: 4,
          points2: 0,
          score1: 0,
          score2: 9,
          player1Id: 'winner-13',
          player2Id: 'loser-13',
          player1: { id: 'winner-13' },
          player2: { id: 'loser-13' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          points1: 0,
          points2: 4,
          score1: 9,
          score2: 0,
          player1Id: 'loser-15',
          player2Id: 'winner-15',
          player1: { id: 'loser-15' },
          player2: { id: 'winner-15' },
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          points1: 4,
          points2: 0,
          score1: 0,
          score2: 9,
          player1Id: 'winner-14',
          player2Id: 'loser-14',
          player1: { id: 'winner-14' },
          player2: { id: 'loser-14' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'finals') return Promise.resolve([]);
        return Promise.resolve(playoffRows);
      });
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 31 });

      const config = createMockConfig({
        putScoreFields: { dbField1: 'points1', dbField2: 'points2' },
      });
      const { POST } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ topN: 24 }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      const seedMap = new Map(
        json.data.seededPlayers.map((p: { seed: number; playerId: string }) => [p.seed, p.playerId]),
      );
      expect(seedMap.get(16)).toBe('winner-16');
      expect(seedMap.get(13)).toBe('winner-13');
      expect(seedMap.get(15)).toBe('winner-15');
      expect(seedMap.get(14)).toBe('winner-14');
    });

    it('GET Top-24 preview warns when a completed playoff R2 winner cannot be resolved', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 5,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-6',
          player2Id: 'player-21',
          player1: { id: 'player-6' },
          player2: { id: 'player-21' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-7',
          player2Id: 'player-20',
          player1: { id: 'player-7' },
          player2: { id: 'player-20' },
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-18',
          player2Id: 'player-9',
          player1: { id: 'player-18' },
          player2: { id: 'player-9' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffRows);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockLogger.warn).toHaveBeenCalledWith('Top-24 playoff winner could not be resolved', {
        tournamentId: 'tournament-123',
        eventTypeCode: 'bm',
        matchNumber: 5,
        advancesToUpperSeed: 16,
      });
    });

    it('GET Top-24 preview resolves a tied playoff winner from suddenDeathWinnerId', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 5,
          suddenDeathWinnerId: 'player-8',
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-6',
          player2Id: 'player-21',
          player1: { id: 'player-6' },
          player2: { id: 'player-21' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-7',
          player2Id: 'player-20',
          player1: { id: 'player-7' },
          player2: { id: 'player-20' },
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-18',
          player2Id: 'player-9',
          player1: { id: 'player-18' },
          player2: { id: 'player-9' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffRows);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      const seededPlayers = json.data.seededPlayers ?? [];
      const playoffSeed = seededPlayers.find((player: { seed: number }) => player.seed === 16);
      expect(playoffSeed).toEqual(
        expect.objectContaining({
          seed: 16,
          playerId: 'player-8',
        }),
      );
      expect(mockLogger.warn).not.toHaveBeenCalledWith('Top-24 playoff winner could not be resolved', {
        tournamentId: 'tournament-123',
        eventTypeCode: 'bm',
        matchNumber: 5,
        advancesToUpperSeed: 16,
      });
    });

    it('logs and falls back when Top-24 preview construction fails', async () => {
      const previewError = Object.assign(new Error('SELECT * FROM SecretTable WHERE token = hidden'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2024',
      });
      (prisma.bMQualification as any).findMany.mockRejectedValue(previewError);
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffRows);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.phase).toBe('playoff');
      expect(json.data.playoffMatches).toEqual([
        expect.objectContaining({
          player1Id: 'player-19',
          player1Tbd: false,
          player2Id: null,
          player2: null,
          player2Tbd: true,
        }),
      ]);
      expect(json.data.seededPlayers).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to build Top-24 finals preview', {
        errorName: 'PrismaClientKnownRequestError',
        errorCode: 'P2024',
        tournamentId: 'tournament-123',
        eventTypeCode: 'bm',
      });
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        'Failed to build Top-24 finals preview',
        expect.objectContaining({ error: previewError }),
      );
    });

    it('does not build a Top-16 preview when a Top-24 playoff has fewer than 24 qualifiers', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(23));
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffRows);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.phase).toBe('playoff');
      expect(json.data.playoffMatches).toHaveLength(1);
      expect(json.data.seededPlayers).toBeUndefined();
      expect(json.data.bracketSize).toBe(8);
      expect(json.data.bracketStructure).toEqual([]);
    });

    it('GET Top-24 preview warns and skips a direct seed with an invalid player payload', async () => {
      const qualifications = createMockQualifications(24);
      qualifications[0].player = null;
      (prisma.bMQualification as any).findMany.mockResolvedValue(qualifications);
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve(playoffRows);
        return Promise.resolve([]);
      });
      (prisma.bMMatch as any).count.mockResolvedValue(0);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const response = await GET(new NextRequest('http://localhost:3000'), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.seededPlayers).toBeDefined();
      expect(json.data.seededPlayers).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ seed: 1, playerId: 'player-0' })]),
      );
      expect(json.data.seededPlayers).toEqual(
        expect.arrayContaining([expect.objectContaining({ seed: 16, playerId: 'player-19' })]),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('Top-24 direct seed player could not be resolved', {
        tournamentId: 'tournament-123',
        eventTypeCode: 'bm',
        seed: 1,
        playerId: 'player-0',
      });
    });

    it('Phase 2 warns before failing when a completed playoff R2 winner cannot be resolved', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      const playoffRows = [
        {
          id: 'p-r2-5',
          matchNumber: 5,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 5,
          player1Id: 'player-19',
          player2Id: 'player-8',
          player1: { id: 'player-19' },
          player2: { id: 'player-8' },
        },
        {
          id: 'p-r2-6',
          matchNumber: 6,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-6',
          player2Id: 'player-21',
          player1: { id: 'player-6' },
          player2: { id: 'player-21' },
        },
        {
          id: 'p-r2-7',
          matchNumber: 7,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-7',
          player2Id: 'player-20',
          player1: { id: 'player-7' },
          player2: { id: 'player-20' },
        },
        {
          id: 'p-r2-8',
          matchNumber: 8,
          round: 'playoff_r2',
          stage: 'playoff',
          completed: true,
          score1: 5,
          score2: 0,
          player1Id: 'player-18',
          player2Id: 'player-9',
          player1: { id: 'player-18' },
          player2: { id: 'player-9' },
        },
      ];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'finals') return Promise.resolve([]);
        return Promise.resolve(playoffRows);
      });

      const config = createMockConfig();
      const { POST } = createFinalsHandlers(config);

      const response = await POST(
        new NextRequest('http://localhost:3000', {
          method: 'POST',
          body: JSON.stringify({ topN: 24 }),
        }),
        {
          params: Promise.resolve({ id: 'tournament-123' }),
        },
      );

      expect(response.status).toBe(500);
      expect(mockLogger.warn).toHaveBeenCalledWith('Top-24 playoff winner could not be resolved', {
        tournamentId: 'tournament-123',
        eventTypeCode: 'bm',
        matchNumber: 5,
        advancesToUpperSeed: 16,
      });
    });
  });

  // ============================================================
  // PUT Handler Tests (15 cases)
  // ============================================================

  describe('PUT Handler', () => {
    // Helper accepts overrides so tests can customize scores, matchId, etc.
    const createMockRequestBody = (overrides = {}) => ({
      matchId: 'match-1',
      score1: 3,
      score2: 1,
      ...overrides,
    });

    it('rejects score submission for an unresolved finals slot before writing', async () => {
      const unresolvedMatch = createMockMatch({
        matchNumber: 8,
        player1Id: null,
        player2Id: null,
        player1: null,
        player2: null,
      });
      (prisma.bMMatch as any).findUnique.mockResolvedValue(unresolvedMatch);

      const { PUT } = createFinalsHandlers(createMockConfig());
      const response = await PUT(
        new NextRequest('http://localhost:3000', {
          method: 'PUT',
          body: JSON.stringify(createMockRequestBody()),
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('MATCH_SLOTS_UNRESOLVED');
      expect(prisma.bMMatch.update).not.toHaveBeenCalled();
    });

    it('should set player1 as winner when score1 >= 3', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1,
        player1Id: 'player-1',
        player2Id: 'player-2',
      });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ score1: 3, score2: 1, completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null); // No next match

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      const json = await response.json();
      expect(json.data.winnerId).toBe('player-1');
      expect(json.data.loserId).toBe('player-2');
    });

    it('should set player2 as winner when score2 >= 3', async () => {
      const requestBody = createMockRequestBody();
      // Override scores to test player2 winning scenario
      requestBody.score1 = 1;
      requestBody.score2 = 3;

      const mockMatch = createMockMatch({
        matchNumber: 1,
        player1Id: 'player-1',
        player2Id: 'player-2',
      });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ score1: 0, score2: 3, completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null); // No next match

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      const json = await response.json();
      expect(json.data.winnerId).toBe('player-2');
      expect(json.data.loserId).toBe('player-1');
    });

    it('should advance winner to next match when winnerGoesTo is set', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextMatch = createMockMatch({ matchNumber: 5 }); // winners_sf

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(nextMatch);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect((prisma.bMMatch as any).findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals', matchNumber: 5 },
      });
      /* Slot writes go through applySlotWrite (issue #3017): a single
       * updateMany that guards against overwriting a completed row, always
       * increments version, and clears any manual slot override since this
       * is authoritative automatic advancement, not a manual adjustment. */
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: { id: nextMatch.id, completed: false },
        data: { player1Id: 'player-1', version: { increment: 1 }, slotOverrideBy: null, slotOverrideAt: null },
      });
    });

    it('clears a manual slot override and logs an audit entry when automatic advancement overwrites it', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const overriddenAt = new Date('2026-07-20T00:00:00.000Z');
      const nextMatch = createMockMatch({
        matchNumber: 5, // winners_sf
        slotOverrideBy: 'admin-1',
        slotOverrideAt: overriddenAt,
      });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(nextMatch);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      await PUT(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      /* The write itself still nulls the override fields unconditionally
       * (asserted by the preceding test) — this test covers the additional
       * audit trail fired specifically because the slot being overwritten
       * had a manual adjustment on it. */
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.AUTO_ADVANCE_OVERRODE_MANUAL_SLOT,
          targetId: nextMatch.id,
          details: expect.objectContaining({
            overriddenManualBy: 'admin-1',
            overriddenManualAt: overriddenAt,
          }),
        }),
      );
    });

    it('does not log an audit entry when the overwritten slot had no manual override', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({ matchNumber: 1, player1Id: 'player-1', player2Id: 'player-2' });
      const nextMatch = createMockMatch({ matchNumber: 5, slotOverrideBy: null, slotOverrideAt: null });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(nextMatch);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      await PUT(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('surfaces advancementWarnings and warn-logs instead of clobbering an already-completed downstream match', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextMatch = createMockMatch({ matchNumber: 5, completed: true }); // winners_sf, already scored

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      /* Winner lookup finds the already-completed downstream match (triggers
       * the warning under test); loser lookup finds nothing so it takes the
       * separate updateRoutedMatch fallback path, which never warns — keeps
       * this test isolated to the winner-advance skip. */
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(nextMatch).mockResolvedValueOnce(null);
      /* applySlotWrite's `completed: false` guard excludes this row, so the
       * conditional updateMany matches 0 rows even though the target exists. */
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 0 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });
      const json = await response.json();

      expect(json.data.advancementWarnings).toEqual([
        { matchNumber: 5, slot: 1, playerId: 'player-1', reason: 'DOWNSTREAM_MATCH_COMPLETED' },
      ]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Skipped bracket advancement: downstream match already completed',
        expect.objectContaining({ targetMatchNumber: 5, slot: 1 }),
      );
      /* Nothing was actually overwritten, so the manual-override-clobbered
       * audit trail must not fire even though `nextMatch` came back with no
       * override set — there's no "before" state to compare against. */
      expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('omits advancementWarnings entirely when every downstream write lands normally', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({ matchNumber: 1, player1Id: 'player-1', player2Id: 'player-2' });
      const nextMatch = createMockMatch({ matchNumber: 5 });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(nextMatch);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'tournament-123' }) });
      const json = await response.json();

      expect(json.data.advancementWarnings).toBeUndefined();
    });

    it('should advance loser to next match when loserGoesTo is set', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextLoserMatch = createMockMatch({ matchNumber: 9 }); // losers_r1

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(nextLoserMatch);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect((prisma.bMMatch as any).findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals', matchNumber: 9 },
      });
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: { id: nextLoserMatch.id, completed: false },
        data: { player1Id: 'player-2', version: { increment: 1 }, slotOverrideBy: null, slotOverrideAt: null },
      });
    });

    it('surfaces advancementWarnings when the downstream loser-bracket match is already completed', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextLoserMatch = createMockMatch({ matchNumber: 9, completed: true }); // losers_r1, already scored

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      /* Winner lookup finds nothing (fallback path, no warning); loser lookup
       * finds the already-completed downstream match under test. */
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(nextLoserMatch);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 0 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });
      const json = await response.json();

      expect(json.data.advancementWarnings).toEqual([
        { matchNumber: 9, slot: 1, playerId: 'player-2', reason: 'DOWNSTREAM_MATCH_COMPLETED' },
      ]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Skipped bracket advancement: downstream match already completed',
        expect.objectContaining({ targetMatchNumber: 9, slot: 1 }),
      );
      expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('should infer 16-player bracket from totalFinalsMatches count in PUT', async () => {
      // 16-player bracket has 31 matches (31 > 20 threshold)
      /* Provide a valid match row so the PUT handler proceeds into the
       * bracket-size inference path; returning null here would trigger an
       * early 404 before count() is consulted. */
      (prisma.bMMatch as any).count.mockResolvedValue(31);
      (prisma.bMMatch as any).findUnique.mockResolvedValue(
        createMockMatch({
          matchNumber: 1,
          player1Id: 'player-1',
          player2Id: 'player-2',
        }),
      );
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify({ matchId: 'match-1', score1: 3, score2: 1 }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).count).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals' },
      });
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16);
    });

    it('should route 16-player QF loser to reversed L_R2 slot and player1Id', async () => {
      // In 16-player bracket, QF losers enter L_R2 at position 1.
      // M9 routes to M23 so the two-group LR2 order is B3/A4/A3/B4.
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 9, // winners_qf in 16-player bracket
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextLoserMatch = createMockMatch({ matchNumber: 23 }); // L_R2 in 16-player

      (prisma.bMMatch as any).count.mockResolvedValue(31); // 16-player bracket
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockImplementation((args: any) => {
        if (args?.where?.matchNumber === 23) return Promise.resolve(nextLoserMatch);
        return Promise.resolve(null);
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      // In 16-player QF, loserPosition=1 → player1Id set
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: { id: nextLoserMatch.id, completed: false },
        data: { player1Id: 'player-2', version: { increment: 1 }, slotOverrideBy: null, slotOverrideAt: null },
      });
    });

    it('should use bracket-defined loserPosition for loser routing', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 9,
        round: 'winners_qf',
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextLoserMatch = createMockMatch({ matchNumber: 23 });

      (prisma.bMMatch as any).count.mockResolvedValue(31);
      mockGenerateBracketStructure.mockReturnValue([
        {
          matchNumber: 9,
          round: 'winners_qf',
          bracket: 'winners',
          loserGoesTo: 23,
          loserPosition: 2,
        },
      ] as any);
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockImplementation((args: any) => {
        if (args?.where?.matchNumber === 23) return Promise.resolve(nextLoserMatch);
        return Promise.resolve(null);
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: { id: nextLoserMatch.id, completed: false },
        data: { player2Id: 'player-2', version: { increment: 1 }, slotOverrideBy: null, slotOverrideAt: null },
      });
    });

    it('should route 16-player Losers R1 winner to L_R2 player2Id', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 16, // losers_r1 in 16-player bracket
        round: 'losers_r1',
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextWinnerMatch = createMockMatch({ matchNumber: 20 }); // L_R2 in 16-player

      (prisma.bMMatch as any).count.mockResolvedValue(31);
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockImplementation((args: any) => {
        if (args?.where?.matchNumber === 20) return Promise.resolve(nextWinnerMatch);
        return Promise.resolve(null);
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: { id: nextWinnerMatch.id, completed: false },
        data: { player2Id: 'player-1', version: { increment: 1 }, slotOverrideBy: null, slotOverrideAt: null },
      });
    });

    it('should populate reset match when loser wins grand final', async () => {
      const requestBody = createMockRequestBody({ score1: 0, score2: 3 }); // player2 wins
      const mockMatch = createMockMatch({
        matchNumber: 16, // grand_final
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const resetMatch = createMockMatch({ matchNumber: 18, round: 'grand_final_reset' });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });

      // Mock findFirst to return different values based on query parameters
      (prisma.bMMatch as any).findFirst.mockImplementation((args) => {
        // Grand final loser doesn't advance to loser bracket, so first two calls return null
        // Third call finds the reset match
        if (args.where?.round === 'grand_final_reset') {
          return Promise.resolve(resetMatch);
        }
        return Promise.resolve(null);
      });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect((prisma.bMMatch as any).findFirst).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals', round: 'grand_final_reset' },
      });
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: { id: resetMatch.id, completed: false },
        data: {
          player1Id: 'player-2',
          player2Id: 'player-1',
          version: { increment: 1 },
          slotOverrideBy: null,
          slotOverrideAt: null,
        },
      });
    });

    it('surfaces advancementWarnings for both reset-match slots when the GF-reset prefill is already completed', async () => {
      const requestBody = createMockRequestBody({ score1: 0, score2: 3 }); // player2 wins
      const mockMatch = createMockMatch({
        matchNumber: 16, // grand_final
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const resetMatch = createMockMatch({ matchNumber: 18, round: 'grand_final_reset', completed: true });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).findFirst.mockImplementation((args) => {
        if (args.where?.round === 'grand_final_reset') {
          return Promise.resolve(resetMatch);
        }
        return Promise.resolve(null);
      });

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });
      const json = await response.json();

      expect(json.data.advancementWarnings).toEqual([
        { matchNumber: 18, slot: 1, playerId: 'player-2', reason: 'DOWNSTREAM_MATCH_COMPLETED' },
        { matchNumber: 18, slot: 2, playerId: 'player-1', reason: 'DOWNSTREAM_MATCH_COMPLETED' },
      ]);
      expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('should set tournament complete when player1 wins grand final', async () => {
      const requestBody = createMockRequestBody({ score1: 3, score2: 0 }); // player1 wins
      const mockMatch = createMockMatch({
        matchNumber: 16, // grand_final
        player1Id: 'player-1',
        player2Id: 'player-2',
      });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      const json = await response.json();
      expect(json.data.isComplete).toBe(true);
      expect(json.data.champion).toBe('player-1');
    });

    it('should set tournament complete when grand_final_reset is completed', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 18, // grand_final_reset (match 17 unused in 8-player bracket)
        player1Id: 'player-1',
        player2Id: 'player-2',
      });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      const json = await response.json();
      expect(json.data.isComplete).toBe(true);
      expect(json.data.champion).toBe('player-1');
    });

    it('should return 400 when score1 < 3 and score2 < 3', async () => {
      const requestBody = createMockRequestBody({ score1: 1, score2: 0 });

      const mockMatch = createMockMatch();

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Match must have a winner (first to 3)');
    });

    it('should return 400 when losing score also reaches or exceeds target wins', async () => {
      const requestBody = createMockRequestBody({ score1: 9, score2: 10 });
      const mockMatch = createMockMatch({ round: 'grand_final' });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const config = createMockConfig({ getTargetWins: () => 9 });
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Match must have a winner (first to 9)');
    });

    it('should return 404 when matchId not found', async () => {
      const requestBody = createMockRequestBody();

      (prisma.bMMatch as any).findUnique.mockResolvedValue(null);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('Finals match not found');
    });

    it('should return 404 when match stage is not finals', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({ stage: 'qualification' });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('Finals match not found');
    });

    it('should sanitize body when sanitizePutBody is true', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch();

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      mockSanitizeInput.mockReturnValue({ matchId: 'match-1', score1: 3, score2: 1 });

      const config = createMockConfig({ sanitizePutBody: true });
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(mockSanitizeInput).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should handle putAdditionalFields', async () => {
      const requestBody = createMockRequestBody({ rounds: [] });
      const mockMatch = createMockMatch();

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true, rounds: [] }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null);

      const config = createMockConfig({ putAdditionalFields: ['rounds'] });
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      // Source includes player1/player2 in the update call for response data
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: {
          score1: 3,
          score2: 1,
          completed: true,
          rounds: [],
        },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      });
    });

    it('should handle when currentBracketMatch is null', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({ matchNumber: 999 }); // Not in bracket

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null); // Not found

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      const json = await response.json();
      expect(json.data.match).toBeDefined();
      expect(json.data.winnerId).toBeUndefined();
      expect(json.data.loserId).toBeUndefined();
    });

    it('should handle when nextWinnerMatch is not found', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf -> winnerGoesTo 5
        player1Id: 'player-1',
        player2Id: 'player-2',
      });

      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null); // Next match not found

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      // Should continue without error - nextWinnerMatch not found is handled
      // Source includes player1/player2 in the update call for response data
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({ completed: true }),
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      });
    });

    it('should return 403 when putRequiresAuth and user is not authenticated', async () => {
      const requestBody = createMockRequestBody();

      mockAuth.mockResolvedValue(null);

      const config = createMockConfig({ putRequiresAuth: true });
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('should return 400 when matchId, score1, or score2 is missing', async () => {
      const requestBody = { matchId: 'match-1', score1: 3 }; // Missing score2

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('matchId and score data are required');
    });

    it('should return 500 on database error', async () => {
      const requestBody = createMockRequestBody();

      (prisma.bMMatch as any).findUnique.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to update match');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update finals match', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });

    it('playoff R1 winner advances to R2 at position 2 (issue #454)', async () => {
      /* Completing playoff_r1 match 1 (seeds 8v9) with player1 winning should
       * write player-8 into match 5 (playoff_r2) as player2 — the standard
       * bracket routing for playoff. Finals stage must not be touched. */
      const playoffMatch = createMockMatch({
        id: 'playoff-1',
        matchNumber: 1,
        stage: 'playoff',
        round: 'playoff_r1',
        player1Id: 'player-8',
        player2Id: 'player-9',
      });
      (prisma.bMMatch as any).findUnique.mockResolvedValue(playoffMatch);
      (prisma.bMMatch as any).update.mockResolvedValue({
        ...playoffMatch,
        score1: 3,
        score2: 0,
        completed: true,
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      /* playoff_r1 uses the factory default target-wins of 3 (matches
       * getBmFinalsTargetWins for playoff non-R2). 3-0 passes the
       * "exactly-reached target" guard so the bracket-advancement path is
       * reachable, which is what this issue #454 regression is asserting. */
      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify({ matchId: 'playoff-1', score1: 3, score2: 0 }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.stage).toBe('playoff');
      expect(json.data.winnerId).toBe('player-8');
      expect(json.data.loserId).toBe('player-9');
      /* Confirm the cross-match advancement targeted playoff_r2 match 5
       * as player2 — not a finals bracket row. */
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 'tournament-123',
          stage: 'playoff',
          matchNumber: 5,
          completed: false,
        },
        data: { player2Id: 'player-8', version: { increment: 1 }, slotOverrideBy: null, slotOverrideAt: null },
      });
    });
  });

  // ============================================================
  // PATCH Handler Tests — TV# select-to-save (issue: bracket card)
  // ============================================================

  describe('PATCH Handler (tvNumber)', () => {
    it('updates tvNumber on a finals match without touching scores', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({ id: 'match-1', stage: 'finals', tvNumber: null });
      /* Two findFirst calls: IDOR check (returns match) + uniqueness check (null = no conflict) */
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...existing, tvNumber: 2 });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.match.tvNumber).toBe(2);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { tvNumber: 2 },
        }),
      );
    });

    it('clears tvNumber when given null', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({ id: 'match-1', stage: 'finals', tvNumber: 3 });
      (prisma.bMMatch as any).findFirst.mockResolvedValue(existing);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...existing, tvNumber: null });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: null }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tvNumber: null } }),
      );
    });

    it('returns 403 when caller is not admin', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } } as any);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(403);
      expect((prisma.bMMatch as any).update).not.toHaveBeenCalled();
    });

    it('returns 400 when matchId is missing', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ tvNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(400);
    });

    it('returns 400 when tvNumber is out of range', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 99 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(400);
    });

    it('returns 404 when match does not belong to the tournament', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      (prisma.bMMatch as any).findFirst.mockResolvedValue(null);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(404);
    });

    it('returns 404 when target match is qualification stage', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({ id: 'match-1', stage: 'qualification' });
      (prisma.bMMatch as any).findFirst.mockResolvedValue(existing);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(404);
      expect((prisma.bMMatch as any).update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // PATCH Handler Tests — startingCourseNumber select-to-save
  // ============================================================

  describe('PATCH Handler (startingCourseNumber)', () => {
    it('updates startingCourseNumber on a finals match (per-match path, propagation off)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({ id: 'match-1', stage: 'finals', startingCourseNumber: null });
      /* Only an IDOR check runs for startingCourseNumber — there is no per-round
       * uniqueness rule like tvNumber, so the second findFirst is not called. */
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(existing);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...existing, startingCourseNumber: 2 });

      /* Default config does NOT enable assignBmStartingCourseByRound, so the
       * route falls through to the legacy per-match update. */
      const { PATCH } = createFinalsHandlers(createMockConfig());
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', startingCourseNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { startingCourseNumber: 2 },
        }),
      );
      expect((prisma.bMMatch as any).updateMany).not.toHaveBeenCalled();
    });

    it('propagates startingCourseNumber to the entire round when assignBmStartingCourseByRound is on (#728)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({
        id: 'match-1',
        stage: 'finals',
        round: 'winners_qf',
        startingCourseNumber: null,
      });
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(existing);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 4 });
      (prisma.bMMatch as any).findUnique.mockResolvedValue({ ...existing, startingCourseNumber: 2 });

      const { PATCH } = createFinalsHandlers(createMockConfig({ assignBmStartingCourseByRound: true }));
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', startingCourseNumber: 2 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      /* updateMany scopes the write to the round so all 4 winners_qf matches
       * converge on the same value. */
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tournamentId: 'tournament-123',
            stage: 'finals',
            round: 'winners_qf',
          }),
          data: { startingCourseNumber: 2 },
        }),
      );
      /* The targeted match's row update goes through updateMany, not update,
       * so the per-match update() must not fire for the course field. */
      expect((prisma.bMMatch as any).update).not.toHaveBeenCalled();
      expect((prisma.bMMatch as any).findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'match-1' } }),
      );
    });

    it('clears startingCourseNumber when given null', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({ id: 'match-1', stage: 'finals', startingCourseNumber: 3 });
      (prisma.bMMatch as any).findFirst.mockResolvedValue(existing);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...existing, startingCourseNumber: null });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', startingCourseNumber: null }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { startingCourseNumber: null } }),
      );
    });

    it('propagates a null clear across the round when assignBmStartingCourseByRound is on', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({
        id: 'match-1',
        stage: 'finals',
        round: 'winners_qf',
        startingCourseNumber: 3,
      });
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(existing);
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 4 });
      (prisma.bMMatch as any).findUnique.mockResolvedValue({ ...existing, startingCourseNumber: null });

      const { PATCH } = createFinalsHandlers(createMockConfig({ assignBmStartingCourseByRound: true }));
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', startingCourseNumber: null }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stage: 'finals', round: 'winners_qf' }),
          data: { startingCourseNumber: null },
        }),
      );
    });

    it('returns 400 when startingCourseNumber is out of range', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', startingCourseNumber: 5 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(400);
    });

    it('returns 400 when neither tvNumber nor startingCourseNumber is supplied', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const { PATCH } = createFinalsHandlers(createMockConfig());

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1' }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(400);
      expect((prisma.bMMatch as any).update).not.toHaveBeenCalled();
    });

    it('updates tvNumber and startingCourseNumber together in a single PATCH (propagation off)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({
        id: 'match-1',
        stage: 'finals',
        tvNumber: null,
        startingCourseNumber: null,
      });
      /* IDOR + uniqueness check (no conflict) — both tvNumber and course are
       * written atomically so the route shouldn't issue two updates. */
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
      (prisma.bMMatch as any).update.mockResolvedValue({
        ...existing,
        tvNumber: 2,
        startingCourseNumber: 3,
      });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2, startingCourseNumber: 3 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledTimes(1);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { tvNumber: 2, startingCourseNumber: 3 },
        }),
      );
    });

    it('writes tvNumber per-match and propagates startingCourseNumber across the round when propagation is on', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as any);
      const existing = createMockMatch({
        id: 'match-1',
        stage: 'finals',
        round: 'winners_qf',
        tvNumber: null,
        startingCourseNumber: null,
      });
      /* IDOR + tv-uniqueness check (no conflict). */
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...existing, tvNumber: 2 });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 4 });
      (prisma.bMMatch as any).findUnique.mockResolvedValue({
        ...existing,
        tvNumber: 2,
        startingCourseNumber: 3,
      });

      const { PATCH } = createFinalsHandlers(createMockConfig({ assignBmStartingCourseByRound: true }));
      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2, startingCourseNumber: 3 }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      expect(response.status).toBe(200);
      /* tvNumber is per-match, course is round-wide. */
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { tvNumber: 2 },
        }),
      );
      expect((prisma.bMMatch as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stage: 'finals', round: 'winners_qf' }),
          data: { startingCourseNumber: 3 },
        }),
      );
    });
  });
});
