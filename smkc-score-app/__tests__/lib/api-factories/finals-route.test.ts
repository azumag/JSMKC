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

    // Default 8-player bracket count (17 matches: 17 <= 20 → bracketSize=8)
    (prisma.bMMatch as any).count.mockResolvedValue(17);

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
      expect(json.data).toEqual([createMockMatch()]);
      expect(json.bracketStructure).toBeDefined();
      expect(json.roundNames).toEqual(roundNames);
      expect(mockPaginate).toHaveBeenCalledWith(
        expect.objectContaining({
          findMany: expect.any(Function),
          count: expect.any(Function),
        }),
        { tournamentId: 'tournament-123', stage: 'finals' },
        { matchNumber: 'asc' },
        { page: 1, limit: 50 }
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
      expect(json.bracketSize).toBe(16);
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
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(8);
      const json = await response.json();
      expect(json.bracketSize).toBe(8);
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

      (prisma.bMMatch as any).findMany.mockResolvedValue(mockMatches);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.matches).toEqual(mockMatches);
      expect(json.winnersMatches).toHaveLength(3); // winners_qf, winners_sf, winners_final
      expect(json.losersMatches).toHaveLength(3); // losers_r1, losers_sf, losers_final
      expect(json.grandFinalMatches).toHaveLength(1); // grand_final
      expect(json.bracketStructure).toBeDefined();
      expect(json.roundNames).toEqual(roundNames);
      expect(json.bracketSize).toBe(8);
    });

    it('should infer 16-player bracket when matches > 20 (grouped)', async () => {
      // 16-player bracket has 31 matches
      const mockMatches = Array.from({ length: 31 }, (_, i) =>
        createMockMatch({ matchNumber: i + 1 })
      );
      (prisma.bMMatch as any).findMany.mockResolvedValue(mockMatches);

      const config = createMockConfig({ getStyle: 'grouped' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(mockGenerateBracketStructure).toHaveBeenCalledWith(16);
      const json = await response.json();
      expect(json.bracketSize).toBe(16);
    });

    it('should return simple response when getStyle is simple', async () => {
      const mockMatches = [createMockMatch()];
      (prisma.bMMatch as any).findMany.mockResolvedValue(mockMatches);

      const config = createMockConfig({ getStyle: 'simple' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.matches).toEqual(mockMatches);
      expect(json.bracketStructure).toBeDefined();
      expect(json.roundNames).toEqual(roundNames);
      expect(json.winnersMatches).toBeUndefined();
      expect(json.losersMatches).toBeUndefined();
      expect(json.grandFinalMatches).toBeUndefined();
      expect(json.bracketSize).toBe(8);
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
      expect(json.matches).toEqual([]);
      expect(json.bracketStructure).toEqual([]);
      expect(json.bracketSize).toBe(8);
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
      (prisma.bMMatch as any).findMany.mockResolvedValue([createMockMatch()]);

      const config = createMockConfig({ getStyle: 'simple' });
      const { GET } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-999' }),
      });

      expect((prisma.bMMatch as any).findMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-999', stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
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
      (prisma.bMMatch as any).create.mockResolvedValue(createMockMatch());

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
      (prisma.bMMatch as any).create.mockResolvedValue(createMockMatch());

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
      (prisma.bMMatch as any).create.mockResolvedValue(createMockMatch());

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
      expect((prisma.bMMatch as any).create).toHaveBeenCalledTimes(17); // 17 matches in 8-player bracket
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
      (prisma.bMMatch as any).create.mockResolvedValue(createMockMatch());
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

    const createMockQualifications = (count = 24) =>
      Array.from({ length: count }, (_, i) => ({
        id: `qual-${i}`,
        playerId: `player-${i}`,
        group: 'A',
        seeding: i + 1,
        player: { id: `player-${i}`, name: `Player ${i + 1}` },
      }));

    it('Phase 1: creates 8 playoff matches when no playoff exists yet', async () => {
      (prisma.bMQualification as any).findMany.mockResolvedValue(createMockQualifications(24));
      /* No existing playoff rows → triggers Phase 1 creation. */
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).create.mockImplementation(
        ({ data }: { data: { matchNumber: number; round: string } }) => ({
          id: `playoff-${data.matchNumber}`,
          ...data,
          player1: { id: data.matchNumber },
          player2: { id: data.matchNumber },
        }),
      );

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
      expect(json.data.matches).toHaveLength(8);
      /* Verifies 8 matches were created with stage='playoff' — the key
       * distinction from Top-8/Top-16 paths which write stage='finals'. */
      expect((prisma.bMMatch as any).create).toHaveBeenCalledTimes(8);
      const createdStages = (prisma.bMMatch as any).create.mock.calls.map(
        (c: [{ data: { stage: string } }]) => c[0].data.stage,
      );
      expect(createdStages.every((s: string) => s === 'playoff')).toBe(true);
      /* Playoff seeds 1-12 must map to qual positions 13-24 — i.e., the top
       * 12 qualifiers are NOT in the playoff pool. */
      const createdPlayerIds = (prisma.bMMatch as any).create.mock.calls.map(
        (c: [{ data: { player1Id: string } }]) => c[0].data.player1Id,
      );
      expect(createdPlayerIds.some((id: string) => ['player-0', 'player-11'].includes(id))).toBe(false);
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
      (prisma.bMMatch as any).findMany.mockResolvedValue(incompletePlayoff);

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
      (prisma.bMMatch as any).findMany.mockResolvedValue(playoffRows);
      (prisma.bMMatch as any).deleteMany.mockResolvedValue({ count: 0 });
      (prisma.bMMatch as any).create.mockImplementation(
        ({ data }: { data: { matchNumber: number; round: string; stage: string } }) => ({
          id: `finals-${data.matchNumber}`,
          ...data,
          player1: { id: data.matchNumber },
          player2: { id: data.matchNumber },
        }),
      );

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
      /* Direct-advance qualifiers occupy seeds 1-12. */
      expect(seedMap.get(1)).toBe('player-0');
      expect(seedMap.get(12)).toBe('player-11');
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
      expect(json.winnerId).toBe('player-1');
      expect(json.loserId).toBe('player-2');
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
      expect(json.winnerId).toBe('player-2');
      expect(json.loserId).toBe('player-1');
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
      (prisma.bMMatch as any).count.mockResolvedValue(31);
      (prisma.bMMatch as any).findUnique.mockResolvedValue(null);
      (prisma.bMMatch as any).update.mockResolvedValue(null);

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
      expect(json.isComplete).toBe(true);
      expect(json.champion).toBe('player-1');
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
      expect(json.isComplete).toBe(true);
      expect(json.champion).toBe('player-1');
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
        include: { player1: true, player2: true },
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
      expect(json.match).toBeDefined();
      expect(json.winnerId).toBeUndefined();
      expect(json.loserId).toBeUndefined();
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
        include: { player1: true, player2: true },
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
      expect(json.error).toBe('matchId, score1, and score2 are required');
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
        score1: 5,
        score2: 0,
        completed: true,
      });
      (prisma.bMMatch as any).updateMany.mockResolvedValue({ count: 1 });
      (prisma.bMMatch as any).findMany.mockResolvedValue([]);

      const config = createMockConfig();
      const { PUT } = createFinalsHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify({ matchId: 'playoff-1', score1: 5, score2: 0 }),
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
});
