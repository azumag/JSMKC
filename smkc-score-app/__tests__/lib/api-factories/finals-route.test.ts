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
import { generateBracketStructure, roundNames } from '@/lib/double-elimination';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Finals Route Factory', () => {
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockGenerateBracketStructure: jest.MockedFunction<typeof generateBracketStructure>;
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
      expect(json.error).toBe('Currently only 8-player brackets are supported');
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
      expect(json.error).toBe('Match must have a winner (best of 5: first to 3)');
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
  });
});
