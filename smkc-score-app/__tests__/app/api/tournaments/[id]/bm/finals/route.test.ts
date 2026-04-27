/**
 * @module BM Finals API Route Tests
 *
 * Test suite for the Battle Mode finals endpoint: /api/tournaments/[id]/bm/finals
 *
 * This file covers three HTTP methods for managing the double-elimination finals bracket:
 *   - GET: Fetches all finals matches grouped by bracket type (winners, losers, grand final).
 *          Matches are categorized by their round prefix (winners_, losers_, grand_final).
 *   - POST: Creates a finals bracket from qualification results. Takes top N qualified players
 *           (currently only 8-player brackets supported) sorted by score, points, and winRounds.
 *   - PUT: Updates a finals match result, determines winner/loser, advances winner to next match
 *          in the bracket, moves loser to losers bracket, handles grand final reset logic
 *          (when losers bracket winner wins), and detects tournament completion.
 *
 * Key behaviors tested:
 *   - Finals match retrieval with correct bracket categorization
 *   - Empty finals data handling
 *   - 8-player bracket creation from qualification seedings
 *   - Default topN value (8) when not specified
 *   - Validation: topN must be 8, sufficient qualified players required
 *   - Match score updates with winner/loser determination
 *   - Winner advancement to next match in bracket
 *   - Loser movement to losers bracket
 *   - Grand final reset when losers bracket winner wins
 *   - Tournament completion detection (grand final and reset match)
 *   - Validation: matchId/score requirements, winner must exist (first to 5)
 *   - 404 handling for non-existent or non-finals matches
 *   - Database error handling with structured logging
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/rate-limit', () => ({ getServerSideIdentifier: jest.fn(), checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 100 }) }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn() }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));
/* Mock qualification-confirmed-check: finals-route gates POST/PUT before the
 * handler runs. Return null (= not locked) so the test can reach the logic. */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/bm/finals/route';
import { configureNextResponseMock } from '../../../../../../helpers/next-response-mock';

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
const _sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const _auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock };
const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };
const jsonMock = NextResponseMock.NextResponse.json;

// Mock NextRequest class
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

describe('BM Finals API Route - /api/tournaments/[id]/bm/finals', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.findFirst as jest.Mock).mockImplementation((args: any) => Promise.resolve({ id: args?.where?.OR?.[0]?.id ?? 't1', bmQualificationConfirmed: false }));
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    configureNextResponseMock(jest.requireMock('next/server').NextResponse);
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('test-ip');
    /* finals-route GET + POST hit prisma.tournament.findUnique as a defensive
     * existence check. Provide a non-null default so the early 404 branch is
     * bypassed for the happy-path tests. */
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    /* PUT bracket-advancement path calls model.count/findFirst/createMany.
     * Patch them onto the auto-mock with safe defaults. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bmMatch = prisma.bMMatch as any;
    if (!bmMatch.count) bmMatch.count = jest.fn();
    if (!bmMatch.findFirst) bmMatch.findFirst = jest.fn();
    if (!bmMatch.createMany) bmMatch.createMany = jest.fn();
    bmMatch.count.mockResolvedValue(17);
    bmMatch.findFirst.mockResolvedValue(null);
    bmMatch.createMany.mockResolvedValue({ count: 0 });
  });

  describe('GET - Fetch finals tournament data', () => {
    // Success case - Returns all finals matches grouped by bracket type
    it('should return finals matches grouped by winners, losers, and grand final brackets', async () => {
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'finals', round: 'winners_qf', player1: { id: 'p1' }, player2: { id: 'p2' } },
        { id: 'm2', tournamentId: 't1', matchNumber: 2, stage: 'finals', round: 'losers_qf', player1: { id: 'p3' }, player2: { id: 'p4' } },
        { id: 'm3', tournamentId: 't1', matchNumber: 3, stage: 'finals', round: 'grand_final', player1: { id: 'p1' }, player2: { id: 'p5' } },
      ];

      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.matches).toEqual(mockMatches);
      expect(result.data.winnersMatches).toHaveLength(1);
      expect(result.data.losersMatches).toHaveLength(1);
      expect(result.data.grandFinalMatches).toHaveLength(1);
      expect(prisma.bMMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'finals' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Returns empty arrays when no finals matches exist
    it('should return empty arrays when no finals matches exist', async () => {
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.matches).toEqual([]);
      expect(result.data.winnersMatches).toEqual([]);
      expect(result.data.losersMatches).toEqual([]);
      expect(result.data.grandFinalMatches).toEqual([]);
    });

    // Success case - Correctly filters matches by round prefix
    it('should correctly categorize matches based on round prefixes', async () => {
      const mockMatches = [
        { id: 'm1', round: 'winners_qf' },
        { id: 'm2', round: 'winners_sf' },
        { id: 'm3', round: 'winners_final' },
        { id: 'm4', round: 'losers_r1' },
        { id: 'm5', round: 'losers_r2' },
        { id: 'm6', round: 'grand_final' },
        { id: 'm7', round: 'grand_final_reset' },
      ];

      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data.winnersMatches).toHaveLength(3);
      expect(result.data.losersMatches).toHaveLength(2);
      expect(result.data.grandFinalMatches).toHaveLength(2);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 error when database query fails', async () => {
      (prisma.bMMatch.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch finals data', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch finals data', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.bMMatch.findMany as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/bm/finals');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    // TC-530/#741: null startingCourseNumber repair must update all rows without NOT condition
    // SQL `NOT (col = ?)` evaluates to NULL (not TRUE) when col IS NULL, so the
    // old NOT filter silently skipped null rows — the primary legacy case to repair.
    it('should repair all-null startingCourseNumber rows without NOT condition in updateMany (#741)', async () => {
      const nullMatches = [
        { id: 'm1', round: 'winners_qf', startingCourseNumber: null },
        { id: 'm2', round: 'winners_qf', startingCourseNumber: null },
        { id: 'm3', round: 'winners_qf', startingCourseNumber: null },
        { id: 'm4', round: 'winners_qf', startingCourseNumber: null },
      ];

      // Call 1: playoff matches (empty — skips playoff normalization)
      // Call 2: finals normalization lookup (select: { id, round, startingCourseNumber })
      // Call 3: main data fetch (include: { player1, player2 })
      (prisma.bMMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([])        // playoff
        .mockResolvedValueOnce(nullMatches) // normalization select
        .mockResolvedValueOnce(nullMatches); // main data

      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 4 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals');
      const params = Promise.resolve({ id: 't1' });
      await GET(request, { params });

      const updateManyCalls = (prisma.bMMatch.updateMany as jest.Mock).mock.calls;
      const repairCall = updateManyCalls.find(([args]) =>
        args?.where?.stage === 'finals' && args?.where?.round === 'winners_qf',
      );
      expect(repairCall).toBeTruthy();
      // Fixed: no NOT condition — SQL null rows would be skipped by NOT
      expect(repairCall[0].where.NOT).toBeUndefined();
      // Assigned value must be in valid [1, 4] range
      const assigned = repairCall[0].data.startingCourseNumber;
      expect(assigned).toBeGreaterThanOrEqual(1);
      expect(assigned).toBeLessThanOrEqual(4);
    });
  });

  describe('POST - Create finals tournament from qualification results', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Creates 8-player finals bracket from qualification results
    it('should create finals bracket with 8 seeded players', async () => {
      const mockQualifications = [
        { id: 'q1', tournamentId: 't1', playerId: 'p1', score: 10, points: 20, player: { id: 'p1', name: 'Player 1' } },
        { id: 'q2', tournamentId: 't1', playerId: 'p2', score: 9, points: 18, player: { id: 'p2', name: 'Player 2' } },
        { id: 'q3', tournamentId: 't1', playerId: 'p3', score: 8, points: 16, player: { id: 'p3', name: 'Player 3' } },
        { id: 'q4', tournamentId: 't1', playerId: 'p4', score: 7, points: 14, player: { id: 'p4', name: 'Player 4' } },
        { id: 'q5', tournamentId: 't1', playerId: 'p5', score: 6, points: 12, player: { id: 'p5', name: 'Player 5' } },
        { id: 'q6', tournamentId: 't1', playerId: 'p6', score: 5, points: 10, player: { id: 'p6', name: 'Player 6' } },
        { id: 'q7', tournamentId: 't1', playerId: 'p7', score: 4, points: 8, player: { id: 'p7', name: 'Player 7' } },
        { id: 'q8', tournamentId: 't1', playerId: 'p8', score: 3, points: 6, player: { id: 'p8', name: 'Player 8' } },
      ];

      const mockCreatedMatch = { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'finals', completed: false, player1: { id: 'p1' }, player2: { id: 'p2' } };

      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      // Issue #420: bracket inserted in one createMany then re-fetched.
      (prisma.bMMatch.createMany as jest.Mock).mockResolvedValue({ count: 17 });
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([mockCreatedMatch]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      // Source returns 201 for successful resource creation (POST)
      expect(result.status).toBe(201);
      expect(result.data.message).toBe('Finals bracket created');
      expect(result.data.seededPlayers).toHaveLength(8);
      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }, { winRounds: 'desc' }],
        take: 8,
      });
      expect(prisma.bMMatch.deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'finals' },
      });
    });

    // Success case - Uses default topN value of 8 when not specified
    it('should use default topN of 8 when not provided in body', async () => {
      /* Need 8 players for the bracket to be created (topN defaults to 8) */
      const mockQualifications = Array.from({ length: 8 }, (_, i) => ({
        id: `q${i + 1}`, tournamentId: 't1', playerId: `p${i + 1}`,
        score: 10 - i, points: 20 - i * 2,
        player: { id: `p${i + 1}` },
      }));

      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.bMMatch.createMany as jest.Mock).mockResolvedValue({ count: 17 });
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      // Source returns 201 for successful resource creation (POST)
      expect(result.status).toBe(201);
      expect(prisma.bMQualification.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 8 }));
    });

    // Validation error case - Returns 400 when topN is not 8 or 16
    it('should return 400 when topN is not 8 or 16', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 12 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported', code: 'VALIDATION_ERROR', details: { field: 'topN' } });
      expect(result.status).toBe(400);
      expect(prisma.bMQualification.findMany).not.toHaveBeenCalled();
    });

    // Validation error case - Returns 400 when not enough players qualified
    it('should return 400 when fewer than topN players qualified', async () => {
      const mockQualifications = [
        { id: 'q1', tournamentId: 't1', playerId: 'p1', score: 10, player: { id: 'p1' } },
        { id: 'q2', tournamentId: 't1', playerId: 'p2', score: 9, player: { id: 'p2' } },
      ];

      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Not enough players qualified. Need 8, found 2', code: 'VALIDATION_ERROR', details: { field: 'qualifications' } });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to create finals bracket', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to create finals', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Seeded players have correct seed numbers
    it('should assign correct seed numbers based on qualification order', async () => {
      const mockQualifications = [
        { id: 'q1', playerId: 'p1', score: 10, player: { id: 'p1' } },
        { id: 'q2', playerId: 'p2', score: 9, player: { id: 'p2' } },
        { id: 'q3', playerId: 'p3', score: 8, player: { id: 'p3' } },
        { id: 'q4', playerId: 'p4', score: 7, player: { id: 'p4' } },
        { id: 'q5', playerId: 'p5', score: 6, player: { id: 'p5' } },
        { id: 'q6', playerId: 'p6', score: 5, player: { id: 'p6' } },
        { id: 'q7', playerId: 'p7', score: 4, player: { id: 'p7' } },
        { id: 'q8', playerId: 'p8', score: 3, player: { id: 'p8' } },
      ];

      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.bMMatch.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.bMMatch.createMany as jest.Mock).mockResolvedValue({ count: 17 });
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data.seededPlayers[0].seed).toBe(1);
      expect(result.data.seededPlayers[7].seed).toBe(8);
    });
  });

  describe('PUT - Update match result and advance players', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Updates match score and determines winner correctly
    it('should update match score and determine winner (player 1 wins)', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'finals',
        round: 'winners_qf',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 0,
        score2: 0,
        completed: false,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockUpdatedMatch = { ...mockMatch, score1: 5, score2: 0, completed: true };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 5, score2: 0 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.winnerId).toBe('p1');
      expect(result.data.loserId).toBe('p2');
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { score1: 5, score2: 0, completed: true },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      });
    });

    // Success case - Player 2 wins the match
    it('should determine winner when player 2 wins', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'finals',
        round: 'winners_qf',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockUpdatedMatch = { ...mockMatch, score1: 1, score2: 5, completed: true };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 1, score2: 5 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data.winnerId).toBe('p2');
      expect(result.data.loserId).toBe('p1');
    });

    // Success case - Advances winner to next match in bracket
    it('should advance winner to next match when winnerGoesTo is defined', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'finals',
        round: 'winners_qf',
        position: 1,
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockNextMatch = { id: 'm2', matchNumber: 3, player1Id: null, player2Id: null };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(mockNextMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 5, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const _result = await PUT(request, { params });

      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm2' },
        data: { player1Id: 'p1' },
      });
    });

    // Success case - Moves loser to losers bracket
    it('should move loser to losers bracket when loserGoesTo is defined', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        matchNumber: 1,
        stage: 'finals',
        round: 'winners_qf',
        position: 1,
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockLoserMatch = { id: 'm10', matchNumber: 9, player1Id: null, player2Id: null };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      (prisma.bMMatch.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockLoserMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 5, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const _result = await PUT(request, { params });

      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm10' },
        data: { player1Id: 'p2' },
      });
    });

    // Success case - Handles grand final reset when losers bracket winner wins
    it('should enable reset match when losers bracket winner wins grand final', async () => {
      /* Grand Final is match 16 in the bracket structure, reset is match 17 */
      const mockMatch = {
        id: 'm16',
        tournamentId: 't1',
        matchNumber: 16,
        stage: 'finals',
        round: 'grand_final',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const mockResetMatch = { id: 'm17', player1Id: null, player2Id: null };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      /* Grand Final has no winnerGoesTo (reset is handled by grand_final_reset round lookup),
         so findFirst is called exactly once: for the grand_final_reset match */
      (prisma.bMMatch.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockResetMatch); // grand_final_reset round lookup

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm16', score1: 1, score2: 7 });
      const params = Promise.resolve({ id: 't1' });
      const _result = await PUT(request, { params });

      /* Verify the reset match is updated with both players */
      expect(prisma.bMMatch.update).toHaveBeenCalledWith({
        where: { id: 'm17' },
        data: { player1Id: 'p2', player2Id: 'p1' },
      });
    });

    // Success case - Detects tournament completion when winners bracket player wins grand final
    it('should detect tournament completion when winners bracket player wins grand final', async () => {
      /* Grand Final is match 16 in the bracket structure */
      const mockMatch = {
        id: 'm16',
        tournamentId: 't1',
        matchNumber: 16,
        stage: 'finals',
        round: 'grand_final',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm16', score1: 7, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data.isComplete).toBe(true);
      expect(result.data.champion).toBe('p1');
    });

    // Success case - Detects tournament completion after reset match
    it('should detect tournament completion after reset match is played', async () => {
      /* Grand Final Reset is match 17 in the bracket structure */
      const mockMatch = {
        id: 'm17',
        tournamentId: 't1',
        matchNumber: 17,
        stage: 'finals',
        round: 'grand_final_reset',
        player1Id: 'p2',
        player2Id: 'p1',
        player1: { id: 'p2' },
        player2: { id: 'p1' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, completed: true });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm17', score1: 7, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data.isComplete).toBe(true);
      expect(result.data.champion).toBe('p2');
    });

    // Validation error case - Returns 400 when matchId is missing
    it('should return 400 when matchId is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'request' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when match has no winner
    it('should return 400 when match has no winner (no score >= 5)', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 2, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Match must have a winner (first to 5)', code: 'VALIDATION_ERROR', details: { field: 'score' } });
      expect(result.status).toBe(400);
    });

    it('should reject first-to-3 scores for BM finals', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        stage: 'finals',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 0 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Match must have a winner (first to 5)', code: 'VALIDATION_ERROR', details: { field: 'score' } });
      expect(result.status).toBe(400);
    });

    it('should allow BM playoff round 1 results to finish at first to 3', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        stage: 'playoff',
        round: 'playoff_r1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.bMMatch.update as jest.Mock).mockResolvedValue({ ...mockMatch, score1: 3, score2: 2, completed: true });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(result.data.stage).toBe('playoff');
      expect(result.data.winnerId).toBe('p1');
    });

    // Not found case - Returns 404 when match not found
    it('should return 404 when match is not found', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Finals match not found', code: 'NOT_FOUND' });
      expect(result.status).toBe(404);
    });

    // Not found case - Returns 404 when match is not in finals stage
    it('should return 404 when match is not in finals stage', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        stage: 'qualification',
        player1Id: 'p1',
        player2Id: 'p2',
      };

      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Finals match not found', code: 'NOT_FOUND' });
      expect(result.status).toBe(404);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.bMMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/bm/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update match', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update finals match', { error: expect.any(Error), tournamentId: 't1' });
    });
  });
});
