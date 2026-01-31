/**
 * @module GP API Route Tests - /api/tournaments/[id]/gp
 *
 * Test suite for the Grand Prix (GP) main API route. Covers:
 * - GET: Fetching GP qualification data and matches for a given tournament.
 * - POST: Setting up GP qualification with player assignments and round-robin match generation.
 * - PUT: Updating match scores with race data (driver points calculation per SMK rules: 9,6,3,1)
 *        and recalculating player qualification stats (wins, ties, losses, score).
 *
 * The GP mode uses a cup-based scoring system where two players compete across
 * 4 races in a cup, and driver points are awarded based on finishing position.
 * Qualification standings are derived from aggregated match results.
 */
// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/rate-limit', () => ({ getServerSideIdentifier: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { CREATE_GP_MATCH: 'CREATE_GP_MATCH' } }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/gp/route';

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as { getServerSideIdentifier: jest.Mock };
const _sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const _auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock };
const _NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

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

describe('GP API Route - /api/tournaments/[id]/gp', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    /* Reset all prisma model mocks to ensure no queued mockResolvedValueOnce values leak between tests */
    (prisma.gPQualification.findMany as jest.Mock).mockReset();
    (prisma.gPQualification.create as jest.Mock).mockReset();
    (prisma.gPQualification.deleteMany as jest.Mock).mockReset();
    (prisma.gPQualification.updateMany as jest.Mock).mockReset();
    (prisma.gPMatch.findMany as jest.Mock).mockReset();
    (prisma.gPMatch.create as jest.Mock).mockReset();
    (prisma.gPMatch.deleteMany as jest.Mock).mockReset();
    (prisma.gPMatch.update as jest.Mock).mockReset();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    rateLimitMock.getServerSideIdentifier.mockResolvedValue('test-ip');
  });

  describe('GET - Fetch grand prix qualification data', () => {
    // Success case - Returns qualifications and matches with valid tournament ID
    it('should return qualifications and matches for a valid tournament', async () => {
      const _mockQualifications = [
        { id: 'q1', tournamentId: 't1', playerId: 'p1', group: 'A', score: 6, points: 10, player: { id: 'p1', name: 'Player 1' } },
      ];
      const mockMatches = [
        { id: 'm1', tournamentId: 't1', matchNumber: 1, stage: 'qualification', player1: { id: 'p1', name: 'Player 1' }, player2: { id: 'p2', name: 'Player 2' } },
      ];

      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue(_mockQualifications);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ qualifications: _mockQualifications, matches: mockMatches });
      expect(result.status).toBe(200);
      expect(prisma.gPQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });
      expect(prisma.gPMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'qualification' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    // Success case - Returns empty arrays when no data exists
    it('should return empty arrays when no qualifications or matches exist', async () => {
      (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ qualifications: [], matches: [] });
      expect(result.status).toBe(200);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 error when database query fails', async () => {
      (prisma.gPQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({ error: 'Failed to fetch grand prix data' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch grand prix data', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Handles invalid tournament ID gracefully
    it('should handle invalid tournament ID gracefully', async () => {
      (prisma.gPQualification.findMany as jest.Mock).mockRejectedValue(new Error('Invalid UUID'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/invalid-id/gp');
      const params = Promise.resolve({ id: 'invalid-id' });
      const result = await GET(request, { params });

      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('POST - Setup grand prix qualification', () => {
    // Success case - Creates qualifications and round-robin matches with authenticated admin
    it('should create qualifications and round-robin matches with valid players array', async () => {
      const mockAuth = { user: { id: 'admin1', name: 'Admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayers = [
        { playerId: 'p1', group: 'A', seeding: 1 },
        { playerId: 'p2', group: 'A', seeding: 2 },
      ];

      (prisma.gPQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.gPMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ message: 'Grand prix setup complete', qualifications: expect.any(Array) });
      expect(result.status).toBe(201);
      expect(prisma.gPQualification.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1' } });
      expect(prisma.gPMatch.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1', stage: 'qualification' } });
      expect(prisma.gPQualification.create).toHaveBeenCalledTimes(2);
      expect(prisma.gPMatch.create).toHaveBeenCalledTimes(1);
    });

    // Success case - Handles multiple groups correctly
    it('should generate matches for multiple groups separately', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayers = [
        { playerId: 'p1', group: 'A' },
        { playerId: 'p2', group: 'A' },
        { playerId: 'p3', group: 'B' },
        { playerId: 'p4', group: 'B' },
      ];

      (prisma.gPQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.gPMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      expect(prisma.gPMatch.create).toHaveBeenCalledTimes(2);
    });

    // Authentication failure case - Returns 401 when user is not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Unauthorized' });
      expect(result.status).toBe(401);
      expect(prisma.gPQualification.deleteMany).not.toHaveBeenCalled();
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ success: false, error: 'Unauthorized' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when players array is missing
    it('should return 400 when players array is missing', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is not an array
    it('should return 400 when players is not an array', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: 'not-an-array' });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is empty
    it('should return 400 when players array is empty', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.gPQualification.deleteMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: [{ playerId: 'p1', group: 'A' }] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Failed to setup grand prix' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to setup grand prix', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Creates correct number of matches for round-robin format
    it('should create correct number of round-robin matches', async () => {
      const mockAuth = { user: { id: 'admin1' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayers = [
        { playerId: 'p1', group: 'A' },
        { playerId: 'p2', group: 'A' },
        { playerId: 'p3', group: 'A' },
      ];

      (prisma.gPQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.gPMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      expect(prisma.gPMatch.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('PUT - Update match score with race data', () => {
    // Success case - Updates match score and recalculate qualifications
    it('should update match score and recalculate player qualifications', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 18,
        points2: 6,
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      const _mockPlayer1Matches = [mockMatch];
      const _mockPlayer2Matches = [mockMatch];

      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      /*
       * Race positions and expected driver points:
       * Race 1: P1=1st(9pts), P2=2nd(6pts)
       * Race 2: P1=1st(9pts), P2=2nd(6pts)
       * Race 3: P1=2nd(6pts), P2=1st(9pts)
       * Race 4: P1=1st(9pts), P2=2nd(6pts)
       * Totals: P1=33, P2=27
       * Note: GP route's calculateDriverPoints only handles positions 1 and 2 (9 and 6 pts)
       */
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {
        matchId: 'm1',
        cup: 'Mushroom Cup',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 2, position2: 1 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ]
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, result1: 'win', result2: 'loss' });
      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({
          cup: 'Mushroom Cup',
          points1: 33,
          points2: 27,
          races: expect.any(Array),
          completed: true,
        }),
        include: { player1: true, player2: true },
      });
      expect(prisma.gPQualification.updateMany).toHaveBeenCalledTimes(2);
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

      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {
        matchId: 'm1',
        cup: 'Mushroom Cup',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 2, position2: 1 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 2, position2: 1 },
        ]
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ match: mockMatch, result1: 'tie', result2: 'tie' });
      expect(result.status).toBe(200);
    });

    // Validation error case - Returns 400 when matchId is missing
    it('should return 400 when matchId is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { cup: 'Mushroom Cup', races: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'matchId, cup, and 4 races are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when cup is missing
    it('should return 400 when cup is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', { matchId: 'm1', races: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'matchId, cup, and 4 races are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when races array length is not 4
    it('should return 400 when races array does not have exactly 4 races', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {
        matchId: 'm1',
        cup: 'Mushroom Cup',
        races: [{ course: 'Mario Circuit 1', position1: 1, position2: 2 }]
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'matchId, cup, and 4 races are required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.gPMatch.update as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {
        matchId: 'm1',
        cup: 'Mushroom Cup',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ]
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Failed to update match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to update match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Calculates correct driver points
    // GP route calculateDriverPoints: 1st=9pts, 2nd=6pts, other=0pts
    it('should calculate correct driver points for each race', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1' },
        player2: { id: 'p2' },
      };

      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      /*
       * Race positions and expected driver points (1st=9, 2nd=6, other=0):
       * Race 1: P1=1st(9), P2=2nd(6)
       * Race 2: P1=2nd(6), P2=1st(9)
       * Race 3: P1=1st(9), P2=3rd(0) - position 3 yields 0 in GP route
       * Race 4: P1=2nd(6), P2=4th(0) - position 4 yields 0 in GP route
       * Totals: P1=9+6+9+6=30, P2=6+9+0+0=15
       */
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {
        matchId: 'm1',
        cup: 'Mushroom Cup',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 2, position2: 1 },
          { course: 'Ghost Valley 1', position1: 1, position2: 3 },
          { course: 'Bowser Castle 1', position1: 2, position2: 4 },
        ]
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      const updateCall = (prisma.gPMatch.update as jest.Mock).mock.calls[0];
      expect(updateCall[0].data.points1).toBe(30);
      expect(updateCall[0].data.points2).toBe(15);
    });

    // Edge case - Recalculates stats correctly for multiple matches
    it('should recalculate stats correctly when player has multiple completed matches', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        points1: 18,
        points2: 6,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };

      const mockPlayer1Matches = [
        mockMatch,
        { id: 'm2', player1Id: 'p1', player2Id: 'p3', points1: 6, points2: 18 },
      ];
      const mockPlayer2Matches = [mockMatch];

      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.gPMatch.findMany as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1Matches)
        .mockResolvedValueOnce(mockPlayer2Matches);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp', {
        matchId: 'm1',
        cup: 'Mushroom Cup',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ]
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
      expect(prisma.gPQualification.updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', playerId: 'p1' },
        data: expect.objectContaining({
          mp: 2,
          wins: 1,
          ties: 0,
          losses: 1,
          score: 2,
        }),
      });
    });
  });
});
