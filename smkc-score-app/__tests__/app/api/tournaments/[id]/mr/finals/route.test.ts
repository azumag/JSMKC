/**
 * @module MR Finals API Route Tests
 *
 * Test suite for the Match Race (MR) finals main endpoint:
 * /api/tournaments/[id]/mr/finals
 *
 * Covers the following HTTP methods and scenarios:
 * - GET: Fetches finals matches with bracket structure and round names.
 *   Tests include success cases (returns matches and bracket, empty bracket),
 *   and error cases (database query failure returning 500).
 * - POST: Creates a finals bracket from top-qualified players using double elimination
 *   format. Tests include success cases (8-player bracket, default topN=8),
 *   validation errors (topN not equal to 8, not enough qualified players),
 *   and error cases (database operation failure).
 * - PUT: Updates a finals match score and handles bracket advancement logic including
 *   winner/loser progression. Tests include success cases (winner advancement,
 *   grand final completion), validation errors (match not found, not in finals stage,
 *   no winner in match, missing required fields), error cases (database failure),
 *   and edge cases (loser bracket advancement, grand final reset when losers bracket
 *   winner beats the winners bracket winner).
 *
 * The finals bracket follows double elimination format where:
 * - Winners advance through winners bracket
 * - Losers drop to losers bracket
 * - Grand final may require a reset if losers bracket winner wins
 *
 * Dependencies mocked: @/lib/double-elimination, @/lib/sanitize, @/lib/logger,
 *   next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/double-elimination', () => ({
  generateBracketStructure: jest.fn(() => []),
  generatePlayoffStructure: jest.fn(() => []),
  roundNames: ['Quarter Finals', 'Semi Finals', 'Finals'],
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));
/* Mock qualification-confirmed-check: the finals-route factory gates POST/PUT
 * on this before it can reach the match logic. Return null (= not locked). */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { generateBracketStructure, generatePlayoffStructure } from '@/lib/double-elimination';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/mr/finals/route';
import { configureNextResponseMock } from '../../../../../../helpers/next-response-mock';

const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const _NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  constructor(
    private url: string,
    private body?: any,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('MR Finals API Route - /api/tournaments/[id]/mr/finals', () => {
  const loggerMock = { error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    configureNextResponseMock(jest.requireMock('next/server').NextResponse);
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
    /* finals-route GET hits prisma.tournament.findUnique defensively — provide
     * a non-null default so the existence-check doesn't short-circuit to 404. */
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    /* PUT handler now calls model.count() to infer bracket size + findFirst() /
     * updateMany() / createMany() for bracket advancement. The auto-mock lacks
     * those members for mRMatch, so patch them in with safe defaults here. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mrMatch = prisma.mRMatch as any;
    if (!mrMatch.count) mrMatch.count = jest.fn();
    if (!mrMatch.findFirst) mrMatch.findFirst = jest.fn();
    if (!mrMatch.createMany) mrMatch.createMany = jest.fn();
    mrMatch.count.mockResolvedValue(17);
    mrMatch.findFirst.mockResolvedValue(null);
    mrMatch.createMany.mockResolvedValue({ count: 0 });
    (generateBracketStructure as jest.Mock).mockReturnValue([
      { matchNumber: 1, round: 'winners_qf', player1Seed: 1, player2Seed: 8, winnerGoesTo: 5, loserGoesTo: 9, position: 1 },
    ]);
  });

  describe('GET - Fetch finals data', () => {
    // Success case - Returns finals matches with bracket structure
    it('should return finals matches and bracket structure', async () => {
      const mockMatches = [
        { id: 'm1', matchNumber: 1, stage: 'finals', round: 'winners_qf', player1: { id: 'p1' }, player2: { id: 'p8' } },
      ];

      (prisma.mRMatch.findMany as jest.Mock).mockImplementation((args: any) => {
        if (args?.where?.stage === 'playoff') return Promise.resolve([]);
        return Promise.resolve(mockMatches);
      });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        matches: mockMatches,
        bracketStructure: expect.any(Array),
        bracketSize: expect.any(Number),
        roundNames: ['Quarter Finals', 'Semi Finals', 'Finals'],
        phase: 'finals',
        playoffMatches: [],
        playoffStructure: [],
        playoffSeededPlayers: [],
        playoffComplete: false,
        qualificationConfirmed: false,
      });
      expect(result.status).toBe(200);
    });

    // Success case - Returns empty bracket when no matches exist
    it('should return empty bracket structure when no matches exist', async () => {
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.bracketStructure).toEqual([]);
      expect(result.status).toBe(200);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 when database query fails', async () => {
      (prisma.mRMatch.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch finals data', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch finals data', { error: expect.any(Error), tournamentId: 't1' });
    });

    /**
     * MR counterpart of the GP per-round cup normalizer (#585 follow-up).
     * Every match in the same finals round must share one assignedCourses
     * array (M1 courses = M2 courses = …). Divergent rows from legacy
     * brackets converge to the dominant existing array via a per-row
     * update (JSON equality filter is unreliable on D1).
     */
    it('should force every finals match in a round to the same assignedCourses', async () => {
      const dominant = ['MC', 'DP', 'GV'];
      const mixedRound = [
        { id: 'mf1', matchNumber: 1, round: 'winners_qf', assignedCourses: dominant, player1: {}, player2: {} },
        { id: 'mf2', matchNumber: 2, round: 'winners_qf', assignedCourses: dominant, player1: {}, player2: {} },
        { id: 'mf3', matchNumber: 3, round: 'winners_qf', assignedCourses: ['BC', 'MB', 'KB'], player1: {}, player2: {} },
        { id: 'mf4', matchNumber: 4, round: 'winners_qf', assignedCourses: [], player1: {}, player2: {} },
      ];
      /* Sequence matches MR's GET: 1st = playoff fetch (empty), 2nd =
       * finals fetch (mixed state), then the legacy-detection scan used by
       * the normalizer — but simple style re-fetches after normalization. */
      (prisma.mRMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mixedRound)
        .mockResolvedValueOnce(mixedRound.map((m) => ({ id: m.id, round: m.round, assignedCourses: m.assignedCourses })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.mRMatch as any).update = jest.fn().mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateMock = (prisma.mRMatch as any).update as jest.Mock;
      /* mf3 (different array) and mf4 (empty) both need repair. mf1 and mf2
       * already agree with the canonical, so they must be skipped. */
      const updatedIds = updateMock.mock.calls.map(([arg]) => arg.where.id);
      expect(updatedIds.sort()).toEqual(['mf3', 'mf4']);
      for (const [arg] of updateMock.mock.calls) {
        expect(arg.data).toEqual({ assignedCourses: dominant });
      }
    });

    /**
     * When no match in the round has any assignedCourses, the normalizer
     * falls back to a fresh assignment (createMrRoundAssignments path),
     * so the empty-round case still converges on one array.
     */
    it('should assign fresh courses to a round with no existing courses', async () => {
      const nullRound = [1, 2, 3, 4].map((n) => ({
        id: `mf${n}`,
        matchNumber: n,
        round: 'winners_qf',
        assignedCourses: [],
        player1: {},
        player2: {},
      }));
      (prisma.mRMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(nullRound)
        .mockResolvedValueOnce(nullRound.map((m) => ({ id: m.id, round: m.round, assignedCourses: m.assignedCourses })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.mRMatch as any).update = jest.fn().mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateMock = (prisma.mRMatch as any).update as jest.Mock;
      /* All four rows get the same canonical array. */
      expect(updateMock).toHaveBeenCalledTimes(4);
      const canonical = updateMock.mock.calls[0][0].data.assignedCourses;
      expect(Array.isArray(canonical)).toBe(true);
      expect(canonical.length).toBeGreaterThan(0);
      for (const [arg] of updateMock.mock.calls) {
        expect(arg.data.assignedCourses).toEqual(canonical);
      }
    });

    /**
     * Already-normalized tournaments must not trigger any writes. Prevents
     * polling from churning the DB on every GET.
     */
    it('should not write when every round already has one course set', async () => {
      const normalized = [
        { id: 'mf1', matchNumber: 1, round: 'winners_qf', assignedCourses: ['MC', 'DP', 'GV'], player1: {}, player2: {} },
        { id: 'mf2', matchNumber: 2, round: 'winners_qf', assignedCourses: ['MC', 'DP', 'GV'], player1: {}, player2: {} },
      ];
      (prisma.mRMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(normalized)
        .mockResolvedValueOnce(normalized.map((m) => ({ id: m.id, round: m.round, assignedCourses: m.assignedCourses })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.mRMatch as any).update = jest.fn();

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((prisma.mRMatch as any).update).not.toHaveBeenCalled();
    });
  });

  describe('POST - Create finals bracket', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Creates 8-player finals bracket
    it('should create 8-player finals bracket with topN=8', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, winRounds: 30, player: { id: 'p1', name: 'Player 1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, winRounds: 24, player: { id: 'p2', name: 'Player 2' } },
        { id: 'q3', playerId: 'p3', score: 6, points: 12, winRounds: 18, player: { id: 'p3', name: 'Player 3' } },
        { id: 'q4', playerId: 'p4', score: 4, points: 8, winRounds: 12, player: { id: 'p4', name: 'Player 4' } },
        { id: 'q5', playerId: 'p5', score: 3, points: 6, winRounds: 9, player: { id: 'p5', name: 'Player 5' } },
        { id: 'q6', playerId: 'p6', score: 2, points: 4, winRounds: 6, player: { id: 'p6', name: 'Player 6' } },
        { id: 'q7', playerId: 'p7', score: 1, points: 2, winRounds: 3, player: { id: 'p7', name: 'Player 7' } },
        { id: 'q8', playerId: 'p8', score: 0, points: 0, winRounds: 0, player: { id: 'p8', name: 'Player 8' } },
      ];

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      // Issue #420: bracket inserted in one createMany then re-fetched.
      (prisma.mRMatch.createMany as jest.Mock).mockResolvedValue({ count: 17 });
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({
        message: 'Finals bracket created',
        matches: expect.any(Array),
        seededPlayers: expect.any(Array),
        bracketStructure: expect.any(Array),
      });
      // Source returns 201 for successful resource creation (POST)
      expect(result.status).toBe(201);
      expect(prisma.mRMatch.createMany).toHaveBeenCalled();
    });

    // Success case - Uses default topN=8 when not provided
    // When topN is not provided, it defaults to 8, so we need 8 qualified players
    it('should use default topN=8 when not provided', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, winRounds: 30, player: { id: 'p1', name: 'Player 1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, winRounds: 24, player: { id: 'p2', name: 'Player 2' } },
        { id: 'q3', playerId: 'p3', score: 6, points: 12, winRounds: 18, player: { id: 'p3', name: 'Player 3' } },
        { id: 'q4', playerId: 'p4', score: 4, points: 8, winRounds: 12, player: { id: 'p4', name: 'Player 4' } },
        { id: 'q5', playerId: 'p5', score: 3, points: 6, winRounds: 9, player: { id: 'p5', name: 'Player 5' } },
        { id: 'q6', playerId: 'p6', score: 2, points: 4, winRounds: 6, player: { id: 'p6', name: 'Player 6' } },
        { id: 'q7', playerId: 'p7', score: 1, points: 2, winRounds: 3, player: { id: 'p7', name: 'Player 7' } },
        { id: 'q8', playerId: 'p8', score: 0, points: 0, winRounds: 0, player: { id: 'p8', name: 'Player 8' } },
      ];

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.mRMatch.createMany as jest.Mock).mockResolvedValue({ count: 17 });
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      // Source returns 201 for successful resource creation (POST)
      expect(result.status).toBe(201);
    });

    // Validation error case - Returns 400 when topN is not 8 or 16
    it('should return 400 when topN is not 8 or 16', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 12 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported', code: 'VALIDATION_ERROR', details: { field: 'topN' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when not enough players qualified
    it('should return 400 when not enough players qualified', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, points: 20, winRounds: 30, player: { id: 'p1', name: 'Player 1' } },
        { id: 'q2', playerId: 'p2', score: 8, points: 16, winRounds: 24, player: { id: 'p2', name: 'Player 2' } },
        { id: 'q3', playerId: 'p3', score: 6, points: 12, winRounds: 18, player: { id: 'p3', name: 'Player 3' } },
        { id: 'q4', playerId: 'p4', score: 4, points: 8, winRounds: 12, player: { id: 'p4', name: 'Player 4' } },
        { id: 'q5', playerId: 'p5', score: 3, points: 6, winRounds: 9, player: { id: 'p5', name: 'Player 5' } },
        { id: 'q6', playerId: 'p6', score: 2, points: 4, winRounds: 6, player: { id: 'p6', name: 'Player 6' } },
        { id: 'q7', playerId: 'p7', score: 1, points: 2, winRounds: 3, player: { id: 'p7', name: 'Player 7' } },
      ];

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Not enough players qualified. Need 8, found 7', code: 'VALIDATION_ERROR', details: { field: 'qualifications' } });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to create finals bracket', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to create finals', { error: expect.any(Error), tournamentId: 't1' });
    });

    it('should assign the same courses to every playoff match in a round', async () => {
      const mockQualifications = Array.from({ length: 24 }, (_, index) => ({
        id: `q${index + 1}`,
        playerId: `p${index + 1}`,
        group: index < 12 ? 'A' : 'B',
        score: 24 - index,
        points: (24 - index) * 2,
        winRounds: (24 - index) * 3,
        player: { id: `p${index + 1}`, name: `Player ${index + 1}` },
      }));
      const playoffStructure = [
        { matchNumber: 1, round: 'playoff_r1', player1Seed: 1, player2Seed: 8 },
        { matchNumber: 2, round: 'playoff_r1', player1Seed: 4, player2Seed: 5 },
        { matchNumber: 5, round: 'playoff_r2', player1Seed: 1, player2Seed: null, advancesToUpperSeed: 16 },
      ];

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.mRMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.mRMatch.create as jest.Mock).mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
        id: `m${data.matchNumber}`,
        ...data,
        player1: { id: data.player1Id },
        player2: { id: data.player2Id },
      }));
      (generatePlayoffStructure as jest.Mock).mockReturnValue(playoffStructure);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 24 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      const createCalls = (prisma.mRMatch.create as jest.Mock).mock.calls.map(([arg]) => arg.data);
      expect(createCalls[0].assignedCourses).toEqual(createCalls[1].assignedCourses);
      expect(createCalls[0].assignedCourses).toHaveLength(5);
      expect(createCalls[2].assignedCourses).toHaveLength(7);
    });
  });

  describe('PUT - Update finals match', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Updates finals match score and advances winner
    it('should update finals match and advance winner', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p8',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p8', name: 'Player 8' },
      };

      const mockUpdatedMatch = { ...mockMatch, score1: 5, score2: 2, completed: true };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm5' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 5, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        match: mockUpdatedMatch,
        winnerId: 'p1',
        loserId: 'p8',
        isComplete: false,
        champion: null,
      });
      expect(result.status).toBe(200);
    });

    /**
     * Admin manual total-score override: when only score1/score2 are sent
     * without rounds[], the existing rounds[] breakdown must be preserved.
     * Mirrors the GP-side guard added in PR #585.
     */
    it('should preserve rounds when manual override omits them', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p8',
        rounds: [{ course: 'MC', winner: 1 }, { course: 'DP', winner: 1 }, { course: 'GV', winner: 1 }],
        score1: 3,
        score2: 0,
        player1: { id: 'p1' },
        player2: { id: 'p8' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, score1: 5, score2: 2, completed: true });
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm5' });

      /* Body omits `rounds`. MR winners_qf defaults to first-to-5, so
       * 5-2 satisfies the target-wins validation. */
      const request = new MockNextRequest(
        'http://localhost:3000/api/tournaments/t1/mr/finals',
        { matchId: 'm1', score1: 5, score2: 2 },
      );
      const params = Promise.resolve({ id: 't1' });
      await PUT(request, { params });

      const firstUpdateCall = (prisma.mRMatch.update as jest.Mock).mock.calls[0][0];
      expect(firstUpdateCall.where).toEqual({ id: 'm1' });
      expect(firstUpdateCall.data.score1).toBe(5);
      expect(firstUpdateCall.data.score2).toBe(2);
      expect(firstUpdateCall.data.completed).toBe(true);
      expect(firstUpdateCall.data).not.toHaveProperty('rounds');
    });

    // Success case - Handles grand final completion
    // Need to mock generateBracketStructure to include a match with matchNumber 15 and round 'grand_final'
    it('should handle grand final completion correctly', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 15,
        round: 'grand_final',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockUpdatedMatch = { ...mockMatch, score1: 9, score2: 7, completed: true };

      /* Override bracket structure to include the grand final match at matchNumber 15 */
      (generateBracketStructure as jest.Mock).mockReturnValue([
        { matchNumber: 15, round: 'grand_final', player1Seed: null, player2Seed: null, winnerGoesTo: null, loserGoesTo: null, position: 1 },
      ]);

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm16', round: 'grand_final_reset' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 9, score2: 7 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({
        match: mockUpdatedMatch,
        winnerId: 'p1',
        loserId: 'p2',
        isComplete: true,
        champion: 'p1',
      });
    });

    // Validation error case - Returns 404 when match not found
    it('should return 404 when finals match not found', async () => {
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'nonexistent', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Finals match not found', code: 'NOT_FOUND' });
      expect(result.status).toBe(404);
    });

    // Validation error case - Returns 404 when match is not in finals stage
    it('should return 404 when match is not in finals stage', async () => {
      const mockMatch = {
        id: 'm1',
        stage: 'qualification',
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Finals match not found', code: 'NOT_FOUND' });
      expect(result.status).toBe(404);
    });

    // Validation error case - Returns 400 when match has no winner
    it('should return 400 when match must have a winner', async () => {
      const mockMatch = {
        id: 'm1',
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 2, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      /* Error message updated: finals-route.ts now uses dynamic "first to N" format */
      expect(result.data).toEqual({ success: false, error: 'Match must have a winner (first to 5)', code: 'VALIDATION_ERROR', details: { field: 'score' } });
      expect(result.status).toBe(400);
    });

    it('should return 400 when a score exceeds the configured target wins', async () => {
      const mockMatch = {
        id: 'm1',
        round: 'grand_final',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 10, score2: 7 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Match must have a winner (first to 9)', code: 'VALIDATION_ERROR', details: { field: 'score' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when required fields missing
    it('should return 400 when required fields are missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update match', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update finals match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles loser bracket advancement
    it('should handle loser bracket advancement correctly', async () => {
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        round: 'winners_qf',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p8',
        player1: { id: 'p1' },
        player2: { id: 'p8' },
      };

      const mockUpdatedMatch = { ...mockMatch, score1: 5, score2: 2, completed: true };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'm5' })
        .mockResolvedValueOnce({ id: 'm9' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 5, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledTimes(3);
    });

    // Edge case - Handles grand final reset scenario
    it('should handle grand final reset when winner comes from losers bracket', async () => {
      const mockMatch = {
        id: 'm15',
        matchNumber: 15,
        round: 'grand_final',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockUpdatedMatch = { ...mockMatch, score1: 7, score2: 9, completed: true };
      const mockResetMatch = { id: 'm16', round: 'grand_final_reset' };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(mockResetMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm15', score1: 7, score2: 9 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });

    it('should allow MR playoff round 2 results to finish at first to 4', async () => {
      const mockMatch = {
        id: 'm5',
        matchNumber: 5,
        round: 'playoff_r2',
        stage: 'playoff',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, score1: 4, score2: 2, completed: true });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm5', score1: 4, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.stage).toBe('playoff');
    });
  });
});
