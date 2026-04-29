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

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/double-elimination');
jest.mock('@/lib/pagination');
jest.mock('@/lib/sanitize');
jest.mock('@/lib/logger');

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
    ...overrides,
  });

  const createMockQualification = (overrides = {}) => ({
    id: 'qual-1',
    playerId: 'player-1',
    group: 'A',
    score: 3,
    wins: 2,
    losses: 0,
    points: 6,
    player: { id: 'player-1', name: 'Player 1' },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.findFirst as jest.Mock).mockImplementation((args: any) => Promise.resolve({ id: args?.where?.OR?.[0]?.id ?? 't1', bmQualificationConfirmed: false, mrQualificationConfirmed: false, gpQualificationConfirmed: false }));

    // Setup mocks
    mockAuth = auth as jest.MockedFunction<typeof auth>;
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
        { matchNumber: 1, round: 'winners_qf', bracket: 'winners', player1Seed: 1, player2Seed: 8, winnerGoesTo: 5, loserGoesTo: 9 },
        { matchNumber: 2, round: 'winners_qf', bracket: 'winners', player1Seed: 4, player2Seed: 5, winnerGoesTo: 5, loserGoesTo: 10 },
        { matchNumber: 3, round: 'winners_qf', bracket: 'winners', player1Seed: 2, player2Seed: 7, winnerGoesTo: 6, loserGoesTo: 10 },
        { matchNumber: 4, round: 'winners_qf', bracket: 'winners', player1Seed: 3, player2Seed: 6, winnerGoesTo: 6, loserGoesTo: 9 },
        { matchNumber: 5, round: 'winners_sf', bracket: 'winners', player1Seed: null, player2Seed: null, winnerGoesTo: 7, loserGoesTo: 13 },
        { matchNumber: 6, round: 'winners_sf', bracket: 'winners', player1Seed: null, player2Seed: null, winnerGoesTo: 7, loserGoesTo: 14 },
        { matchNumber: 7, round: 'winners_final', bracket: 'winners', player1Seed: null, player2Seed: null, winnerGoesTo: 16, loserGoesTo: 15 },
        { matchNumber: 8, round: 'losers_r1', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 11, loserGoesTo: undefined },
        { matchNumber: 9, round: 'losers_r1', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 12, loserGoesTo: undefined },
        { matchNumber: 10, round: 'losers_r2', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 11, loserGoesTo: undefined },
        { matchNumber: 11, round: 'losers_r2', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 12, loserGoesTo: undefined },
        { matchNumber: 12, round: 'losers_r3', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 14, loserGoesTo: undefined },
        { matchNumber: 13, round: 'losers_r3', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 14, loserGoesTo: undefined },
        { matchNumber: 14, round: 'losers_sf', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 15, loserGoesTo: undefined },
        { matchNumber: 15, round: 'losers_final', bracket: 'losers', player1Seed: null, player2Seed: null, winnerGoesTo: 16, loserGoesTo: undefined },
        { matchNumber: 16, round: 'grand_final', bracket: 'grand_final', player1Seed: null, player2Seed: null, winnerGoesTo: 18, loserGoesTo: undefined },
        { matchNumber: 18, round: 'grand_final_reset', bracket: 'grand_final', player1Seed: null, player2Seed: null, winnerGoesTo: undefined },
      ];
    };

    // Default bracket structure with 17 matches
    mockGenerateBracketStructure.mockReturnValue(createFullBracketStructure());

    // Default playoff structure (issue #454) — 8 matches, 4 R1 + 4 R2.
    // Mirrors real generatePlayoffStructure(12) so handleTop24Post tests
    // exercise the real routing/mapping semantics end-to-end.
    mockGeneratePlayoffStructure.mockReturnValue([
      { matchNumber: 1, round: 'playoff_r1', bracket: 'winners', player1Seed: 8, player2Seed: 9, winnerGoesTo: 5, position: 2 },
      { matchNumber: 2, round: 'playoff_r1', bracket: 'winners', player1Seed: 5, player2Seed: 12, winnerGoesTo: 6, position: 2 },
      { matchNumber: 3, round: 'playoff_r1', bracket: 'winners', player1Seed: 6, player2Seed: 11, winnerGoesTo: 7, position: 2 },
      { matchNumber: 4, round: 'playoff_r1', bracket: 'winners', player1Seed: 7, player2Seed: 10, winnerGoesTo: 8, position: 2 },
      { matchNumber: 5, round: 'playoff_r2', bracket: 'winners', player1Seed: 1, advancesToUpperSeed: 16 },
      { matchNumber: 6, round: 'playoff_r2', bracket: 'winners', player1Seed: 4, advancesToUpperSeed: 13 },
      { matchNumber: 7, round: 'playoff_r2', bracket: 'winners', player1Seed: 3, advancesToUpperSeed: 14 },
      { matchNumber: 8, round: 'playoff_r2', bracket: 'winners', player1Seed: 2, advancesToUpperSeed: 15 },
    ]);

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
        expect.objectContaining({ page: 1, limit: 50 })
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
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16);
      const json = await response.json();
      expect(json.data.bracketSize).toBe(16);
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
      const mockMatches = Array.from({ length: 31 }, (_, i) =>
        createMockMatch({ matchNumber: i + 1 })
      );
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        return Promise.resolve(mockMatches);
      });

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16);
      const json = await response.json();
      expect(json.data.bracketSize).toBe(16);
    });

    it('should return simple response when getStyle is simple', async () => {
      const mockMatches = [createMockMatch()];
      (prisma.bMMatch as any).findMany.mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
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
      /* Dominant value (3) must win. The bug (#741) was that WHERE NOT (col=?)
       * evaluates to NULL (not TRUE) when col IS NULL, silently skipping null
       * rows. The fix removes NOT so all rows in the round are updated. */
      const updateCall = (prisma.bMMatch as any).updateMany.mock.calls.find(
        (c: any[]) => c[0]?.where?.stage === 'playoff' && c[0]?.where?.round === 'playoff_r1',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].where).toMatchObject({ tournamentId: 'tournament-123', stage: 'playoff', round: 'playoff_r1' });
      expect(updateCall[0].data).toEqual({ startingCourseNumber: 3 });
      // Critical: NOT must be absent — its presence would silently skip NULL rows in SQL
      expect(updateCall[0].where).not.toHaveProperty('NOT');
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
      expect(json.data.playoffMatches).toEqual(mockPlayoffMatches);
      expect(json.data.playoffStructure).toBeDefined();
      expect(json.data.playoffStructure.length).toBe(8);
      expect(json.data.playoffSeededPlayers).toBeDefined();
      expect(json.data.playoffSeededPlayers.length).toBeGreaterThan(0);
      expect(json.data.phase).toBe('playoff');
      expect(json.data.playoffComplete).toBe(true);
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
      expect(json.data.playoffMatches).toEqual(mockPlayoffMatches);
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
      expect(json.data.playoffMatches).toEqual(mockPlayoffMatches);
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
      expect(json.error).toBe(
        'Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported',
      );
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
        return {
          id: `qual-${i}`,
          playerId: `player-${i}`,
          group: groupLetters[Math.min(groupIdx, groupCount - 1)],
          seeding: (i % perGroup) + 1,
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
        .mockResolvedValueOnce([])              // existingPlayoff
        .mockResolvedValueOnce([])              // existingFinals
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
      /* Per issue #454 the barrage pool = each group's rank 7..12, interleaved.
       * Top-6 of each group (A: player-0..5, B: player-12..17) must NOT appear
       * as player1 in any playoff match — they advance directly to the Upper
       * Bracket. Top 7-12 of each group (player-6..11, player-18..23) are the
       * pool from which playoff player1Id values are drawn. */
      const createdPlayerIds = createManyCall.data.map((d: { player1Id: string }) => d.player1Id);
      const directAdvancers = [
        'player-0', 'player-1', 'player-2', 'player-3', 'player-4', 'player-5',
        'player-12', 'player-13', 'player-14', 'player-15', 'player-16', 'player-17',
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
        { id: 'p-r2-5', matchNumber: 5, round: 'playoff_r2', stage: 'playoff', completed: true, score1: 5, score2: 0, player1Id: 'x', player2Id: 'y' },
        { id: 'p-r2-6', matchNumber: 6, round: 'playoff_r2', stage: 'playoff', completed: false, score1: 0, score2: 0, player1Id: 'x', player2Id: 'y' },
        { id: 'p-r2-7', matchNumber: 7, round: 'playoff_r2', stage: 'playoff', completed: true, score1: 5, score2: 0, player1Id: 'x', player2Id: 'y' },
        { id: 'p-r2-8', matchNumber: 8, round: 'playoff_r2', stage: 'playoff', completed: false, score1: 0, score2: 0, player1Id: 'x', player2Id: 'y' },
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
       * Expected Upper-seed mapping (R2 match → Upper seed):
       *   match 5 → Upper seed 16 (winner = player-12)
       *   match 6 → Upper seed 13 (winner = player-15)
       *   match 7 → Upper seed 14 (winner = player-14)
       *   match 8 → Upper seed 15 (winner = player-13)
       * Together with qual top-12 (player-0 … player-11) these fill the 16 seeds. */
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
          player1Id: `player-${12 + i}`,
          player2Id: `player-${20 + i}`,
          player1: { id: `player-${12 + i}` },
          player2: { id: `player-${20 + i}` },
        })),
        { id: 'p-r2-5', matchNumber: 5, round: 'playoff_r2', stage: 'playoff', completed: true, score1: 5, score2: 0, player1Id: 'player-12', player2Id: 'player-20', player1: { id: 'player-12' }, player2: { id: 'player-20' } },
        { id: 'p-r2-6', matchNumber: 6, round: 'playoff_r2', stage: 'playoff', completed: true, score1: 5, score2: 0, player1Id: 'player-15', player2Id: 'player-21', player1: { id: 'player-15' }, player2: { id: 'player-21' } },
        { id: 'p-r2-7', matchNumber: 7, round: 'playoff_r2', stage: 'playoff', completed: true, score1: 5, score2: 0, player1Id: 'player-14', player2Id: 'player-22', player1: { id: 'player-14' }, player2: { id: 'player-22' } },
        { id: 'p-r2-8', matchNumber: 8, round: 'playoff_r2', stage: 'playoff', completed: true, score1: 5, score2: 0, player1Id: 'player-13', player2Id: 'player-23', player1: { id: 'player-13' }, player2: { id: 'player-23' } },
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
      /* 16-player bracket generator is invoked once we have 4 playoff winners. */
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16);
      /* Existing finals (if any) must be cleared before Phase-2 creation —
       * this supports reset scenarios where Phase-2 is retried. */
      expect((prisma.bMMatch as any).deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'finals' },
      });
      /* Verify seed 13-16 mapping: playoff R2 match → Upper-bracket seed. */
      const seededPlayers: Array<{ seed: number; playerId: string }> = json.data.seededPlayers;
      const seedMap = new Map(seededPlayers.map(p => [p.seed, p.playerId]));
      expect(seedMap.get(16)).toBe('player-12'); /* From playoff R2 match 5 */
      expect(seedMap.get(13)).toBe('player-15'); /* From playoff R2 match 6 */
      expect(seedMap.get(14)).toBe('player-14'); /* From playoff R2 match 7 */
      expect(seedMap.get(15)).toBe('player-13'); /* From playoff R2 match 8 */
      /* Direct-advance qualifiers occupy seeds 1-12, interleaved by group rank (#454):
       * seed 1 = A-rank-1 (player-0), seed 2 = B-rank-1 (player-12),
       * seed 3 = A-rank-2 (player-1), ..., seed 12 = B-rank-6 (player-17). */
      expect(seedMap.get(1)).toBe('player-0');
      expect(seedMap.get(2)).toBe('player-12');
      expect(seedMap.get(11)).toBe('player-5');  /* A-rank-6 */
      expect(seedMap.get(12)).toBe('player-17'); /* B-rank-6 */
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
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: nextMatch.id },
        data: { player1Id: 'player-1' },
      });
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
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: nextLoserMatch.id },
        data: { player1Id: 'player-2' },
      });
    });

    it('should infer 16-player bracket from totalFinalsMatches count in PUT', async () => {
      // 16-player bracket has 31 matches (31 > 20 threshold)
      /* Provide a valid match row so the PUT handler proceeds into the
       * bracket-size inference path; returning null here would trigger an
       * early 404 before count() is consulted. */
      (prisma.bMMatch as any).count.mockResolvedValue(31);
      (prisma.bMMatch as any).findUnique.mockResolvedValue(createMockMatch({
        matchNumber: 1,
        player1Id: 'player-1',
        player2Id: 'player-2',
      }));
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

    it('should route 16-player QF loser to player2Id (loserPosition=2)', async () => {
      // In 16-player bracket, QF losers enter L_R2 at position 2
      const requestBody = createMockRequestBody();
      const mockMatch = createMockMatch({
        matchNumber: 1, // winners_qf in 16-player bracket
        player1Id: 'player-1',
        player2Id: 'player-2',
      });
      const nextLoserMatch = createMockMatch({ matchNumber: 10 }); // L_R2 in 16-player

      (prisma.bMMatch as any).count.mockResolvedValue(31); // 16-player bracket
      (prisma.bMMatch as any).findUnique.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(createMockMatch({ completed: true }));
      (prisma.bMMatch as any).findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(nextLoserMatch);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      // In 16-player QF, loserPosition=2 → player2Id set
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: nextLoserMatch.id },
        data: { player2Id: 'player-2' },
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
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: resetMatch.id },
        data: { player1Id: 'player-2', player2Id: 'player-1' },
      });
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
        },
        data: { player2Id: 'player-8' },
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
      (prisma.bMMatch as any).findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
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

      const { PATCH } = createFinalsHandlers(
        createMockConfig({ assignBmStartingCourseByRound: true }),
      );
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

      const { PATCH } = createFinalsHandlers(
        createMockConfig({ assignBmStartingCourseByRound: true }),
      );
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
      (prisma.bMMatch as any).findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
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
      (prisma.bMMatch as any).findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      (prisma.bMMatch as any).update.mockResolvedValue({ ...existing, tvNumber: 2 });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 4 });
      (prisma.bMMatch as any).findUnique.mockResolvedValue({
        ...existing,
        tvNumber: 2,
        startingCourseNumber: 3,
      });

      const { PATCH } = createFinalsHandlers(
        createMockConfig({ assignBmStartingCourseByRound: true }),
      );
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
