/**
 * @module MR API Route Tests
 *
 * Test suite for the Match Race (MR) main API route: /api/tournaments/[id]/mr
 *
 * Covers the following HTTP methods and scenarios:
 * - GET: Fetches match race qualification data and matches for a given tournament.
 *   Tests include success cases (valid tournament, empty data), error cases (database failures),
 *   and edge cases (invalid tournament ID).
 * - POST: Sets up match race qualification by creating player qualifications and
 *   generating round-robin matches across groups. Tests include success cases (valid players,
 *   multiple groups), validation errors (missing/invalid/empty players array), and error cases.
 * - PUT: Updates an individual match score and recalculates qualification stats for both
 *   players involved. Tests include success cases (win/loss, tie, rounds data), validation
 *   errors (missing matchId or scores), error cases, and edge cases (multiple match recalculation).
 *
 * Dependencies mocked: @/lib/logger, @/lib/sanitize, next/server, @/lib/prisma
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/standings-cache', () => ({ invalidate: jest.fn().mockResolvedValue(undefined), generateETag: jest.fn().mockReturnValue('mock-etag') }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/rate-limit', () => ({ getServerSideIdentifier: jest.fn(), checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 100 }) }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: {} }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));
/* Mock qualification-confirmed-check: the qualification-route factory now checks
 * if qualification is locked before allowing score edits. Return null (= not locked). */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));

import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/mr/route';
import { configureNextResponseMock } from '../../../../../helpers/next-response-mock';

const EXPECTED_MATCH_UPDATE_SELECT = {
  id: true,
  tournamentId: true,
  player1Id: true,
  player2Id: true,
  score1: true,
  score2: true,
  rounds: true,
  completed: true,
  isBye: true,
};

const _rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const _NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  private _headersMap: Map<string, string>;
  headers: { get: (key: string) => string | null };

  constructor(
    private url: string,
    private body?: Record<string, unknown>,
    headersMap?: Map<string, string>
  ) {
    this._headersMap = headersMap || new Map();
    this.headers = {
      get: (key: string) => this._headersMap.get(key) ?? null,
    };
  }
  async json() { return this.body; }
  get header() { return { get: (key: string) => this._headersMap.get(key) ?? null }; }
}

describe('MR API Route - /api/tournaments/[id]/mr', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.findFirst as jest.Mock).mockImplementation((args: any) => Promise.resolve({ id: args?.where?.OR?.[0]?.id ?? 't1', mrQualificationConfirmed: false }));
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin1', role: 'admin' } });
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    configureNextResponseMock(jest.requireMock('next/server').NextResponse);
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
  });

  describe('GET - Fetch match race qualification data', () => {
    // Success case - Returns qualifications and matches with valid tournament ID
    it('should return qualifications and matches for a valid tournament', async () => {
      const mockQualifications = [
        { id: 'q1', tournamentId: 't1', playerId: 'p1', group: 'A', score: 6, points: 10, player: { id: 'p1', name: 'Player 1' } },
      ];
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'qualification', player1: { id: 'p1', name: 'Player 1' }, player2: { id: 'p2', name: 'Player 2' } },
      ];

      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue(mockQualifications);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      /* qualificationConfirmed is now included in the GET response */
      expect(result.data).toEqual({ qualifications: [{ ...mockQualifications[0], _rank: 1 }], matches: mockMatches, qualificationConfirmed: false });
      expect(result.status).toBe(200);
      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
      });
      expect(prisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'qualification' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Returns empty arrays when no data exists
    it('should return empty arrays when no qualifications or matches exist', async () => {
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ qualifications: [], matches: [], qualificationConfirmed: false });
      expect(result.status).toBe(200);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 error when database query fails', async () => {
      (prisma.mRQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to fetch match race data', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch match race data', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.mRQualification.findMany as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/mr');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('POST - Setup match race qualification', () => {
    // Success case - Creates qualifications and matches with valid players array
    it('should create qualifications and round-robin matches with valid players array', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayers = [
        { playerId: 'p1', group: 'A', seeding: 1 },
        { playerId: 'p2', group: 'A', seeding: 2 },
      ];
      const _mockQualifications = [{ id: 'q1', tournamentId: 't1', playerId: 'p1', group: 'A' }];

      // Issue #420: setup now uses createMany + a findMany re-fetch.
      (prisma.mRQualification.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
      (prisma.mRMatch.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ message: 'Match race setup complete', qualifications: expect.any(Array) });
      expect(result.status).toBe(201);
      expect(prisma.mRQualification.createMany).toHaveBeenCalledTimes(1);
      expect((prisma.mRQualification.createMany as jest.Mock).mock.calls[0][0].data).toHaveLength(2);
      expect(prisma.mRMatch.createMany).toHaveBeenCalledTimes(1);
      expect((prisma.mRMatch.createMany as jest.Mock).mock.calls[0][0].data).toHaveLength(1);
    });

    // Success case - Handles multiple groups correctly
    it('should generate matches for multiple groups separately', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayers = [
        { playerId: 'p1', group: 'A' },
        { playerId: 'p2', group: 'A' },
        { playerId: 'p3', group: 'B' },
        { playerId: 'p4', group: 'B' },
      ];

      (prisma.mRQualification.createMany as jest.Mock).mockResolvedValue({ count: 4 });
      (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([{ id: 'q1' }]);
      (prisma.mRMatch.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      // Two groups → one createMany call carrying both groups' matches.
      expect(prisma.mRMatch.createMany).toHaveBeenCalledTimes(1);
      expect((prisma.mRMatch.createMany as jest.Mock).mock.calls[0][0].data).toHaveLength(2);
    });

    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
      expect(prisma.mRQualification.deleteMany).not.toHaveBeenCalled();
    });

    // Authorization failure case - Returns 403 when session exists but user is missing
    it('should return 403 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
      expect(prisma.mRQualification.deleteMany).not.toHaveBeenCalled();
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      const mockAuth = { user: { id: 'player1', role: 'player' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
      expect(prisma.mRQualification.deleteMany).not.toHaveBeenCalled();
    });

    // Validation error case - Returns 400 when players array is missing
    it('should return 400 when players array is missing', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Players array is required', code: 'VALIDATION_ERROR', details: { field: 'players' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is not an array
    it('should return 400 when players is not an array', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: 'not-an-array' });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Players array is required', code: 'VALIDATION_ERROR', details: { field: 'players' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is empty
    it('should return 400 when players array is empty', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Players array is required', code: 'VALIDATION_ERROR', details: { field: 'players' } });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    // Mock mRQualification.deleteMany to reject since it's called first in the factory
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.mRQualification.deleteMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [{ playerId: 'p1', group: 'A' }] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to setup match race', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to setup match race', { error: expect.any(Error), tournamentId: 't1' });
    });
  });

  describe('PUT - Update match score', () => {
    // Authorization failure case - Returns 403 when user is not authenticated
    it('should return 403 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Authorization failure case - Returns 403 when user is not admin
    it('should return 403 when user is not admin', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user1', role: 'member' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
      expect(result.status).toBe(403);
    });

    // Success case - Updates match score and recalculates qualifications
    it('should update match score and recalculate player qualifications', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        score1: 3,
        score2: 1,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const _mockPlayer1Matches = [mockMatch];
      const _mockPlayer2Matches = [mockMatch];

      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, result1: 'win', result2: 'loss' });
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1', tournamentId: 't1' },
        data: { score1: 3, score2: 1, rounds: null, completed: true },
        select: EXPECTED_MATCH_UPDATE_SELECT,
      });
      expect(prisma.mRQualification.updateMany).toHaveBeenCalledTimes(2);
    });

    // Success case - Calculates tie result correctly
    it('should handle tie results correctly', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 2, score2: 2 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, result1: 'tie', result2: 'tie' });
      expect(result.status).toBe(200);
    });

    // Success case - Includes rounds data when provided
    it('should include rounds data when provided', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      /* Rounds must have course and winner fields per MR validation */
      const validRounds = [
        { course: 'MC1', winner: 1 }, { course: 'DP1', winner: 1 },
        { course: 'GV1', winner: 1 }, { course: 'BC1', winner: 2 },
      ];
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1, rounds: validRounds });
      const params = Promise.resolve({ id: 't1' });
      const _result = await PUT(request, { params });

      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1', tournamentId: 't1' },
        data: { score1: 3, score2: 1, rounds: validRounds, completed: true },
        select: EXPECTED_MATCH_UPDATE_SELECT,
      });
    });

    // Validation error case - Returns 400 when matchId is missing
    it('should return 400 when matchId is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'scores' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'scores' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'matchId, score1, and score2 are required', code: 'VALIDATION_ERROR', details: { field: 'scores' } });
      expect(result.status).toBe(400);
    });

    // Validation error case - Rejects out-of-range scores (MR max is 4, one per course)
    it('should return 400 when score exceeds MAX_RACE_WIN_SCORE', async () => {
      // score1=5 exceeds the 4-race maximum
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 5, score2: 0 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Match race score must be an integer between 0 and 4', code: 'VALIDATION_ERROR', details: { field: 'scores' } });
      expect(result.status).toBe(400);
      expect(prisma.mRMatch.update).not.toHaveBeenCalled();
    });

    // Validation error case - Rejects negative scores
    it('should return 400 when score is negative', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: -1, score2: 4 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Match race score must be an integer between 0 and 4', code: 'VALIDATION_ERROR', details: { field: 'scores' } });
      expect(result.status).toBe(400);
      expect(prisma.mRMatch.update).not.toHaveBeenCalled();
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRMatch.update as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Failed to update match', code: 'INTERNAL_ERROR' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Recalculates stats correctly for multiple matches
    it('should recalculate stats correctly when player has multiple completed matches', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockPlayer1Matches = [
        { ...mockMatch, id: 'm1', score1: 3, score2: 1, player1Id: 'p1', player2Id: 'p2' },
        { id: 'm2', score1: 2, score2: 2, player1Id: 'p1', player2Id: 'p3' },
      ];
      const mockPlayer2Matches = [
        { id: 'm1', score1: 3, score2: 1, player1Id: 'p1', player2Id: 'p2' },
      ];

      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.findMany as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1Matches)
        .mockResolvedValueOnce(mockPlayer2Matches);
      (prisma.mRQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.mRQualification.updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', playerId: 'p1' },
        data: expect.objectContaining({
          mp: 2,
          wins: 1,
          ties: 1,
          losses: 0,
          score: 3,
        }),
      });
    });
  });
});
