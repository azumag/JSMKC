/**
 * @module __tests__/lib/api-factories/qualification-route.test.ts
 *
 * Test suite for qualification route factory from `@/lib/api-factories/qualification-route`.
 *
 * This suite validates the factory function that generates GET/POST/PUT/PATCH handlers
 * for qualification API routes. Tests cover:
 *
 * - GET handler: Fetching qualification standings and matches
 * - POST handler: Setting up qualification groups and generating round-robin matches
 *   - Authentication requirement (postRequiresAuth)
 *   - Player array validation and group partitioning
 *   - Round-robin match generation within groups
 *   - Audit logging (non-critical, graceful failure)
 * - PUT handler: Updating match score and recalculating player standings
 *   - Authentication requirement (putRequiresAuth)
 *   - Body parsing (parsePutBody)
 *   - Match update via config.updateMatch
 *   - Match result calculation
 *   - Player stats aggregation and qualification record updates
 *   - BYE match: skip player2 (BREAK) recalculation
 *   - Error handling for DB failures and invalid input
 * - PATCH handler: TV number assignment for broadcast streams
 *   - Admin-only authentication
 *   - Input validation (matchId required, tvNumber positive int or null)
 *   - sanitizeInput applied to request body
 *   - tournamentId ownership check (IDOR prevention)
 *   - Error handling for DB failures
 *
 * Tests mock all dependencies including prisma, auth, audit-log, rate-limit,
 * sanitize, and logger to isolate the factory function behavior.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

import { createQualificationHandlers } from '@/lib/api-factories/qualification-route';
import { NextRequest } from 'next/server';
import { EventTypeConfig } from '@/lib/event-types/types';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/audit-log');
/* Mock qualification-confirmed check: defaults to unlocked (null = no error) */
jest.mock('@/lib/qualification-confirmed-check', () => ({
  checkQualificationConfirmed: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ success: true, remaining: 100 }) }));
jest.mock('@/lib/sanitize');
jest.mock('@/lib/logger');
/* PATCH's rank-override branch calls standings-cache.invalidate after a
 * successful update; without this mock, requiring the module inside the
 * handler crashes the request → 500. */
jest.mock('@/lib/standings-cache', () => ({
  invalidate: jest.fn().mockResolvedValue(undefined),
}));

import { auth } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Qualification Route Factory', () => {
  let mockAuth: jest.Mock;
  let mockCreateAuditLog: jest.Mock;
  let mockGetServerSideIdentifier: jest.Mock;
  let mockSanitizeInput: jest.Mock;
  let mockLogger: ReturnType<typeof createLogger>;

  const createMockConfig = (overrides = {}) => ({
    eventTypeCode: 'bm',
    matchModel: 'bMMatch',
    qualificationModel: 'bMQualification',
    loggerName: 'bm-qualification',
    eventDisplayName: 'Battle Mode',
    qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }],
    postRequiresAuth: false,
    putRequiresAuth: false,
    auditAction: 'SETUP_QUALIFICATION',
    setupCompleteMessage: 'Qualification setup complete',
    parsePutBody: jest.fn().mockReturnValue({ valid: true, data: { matchId: 'match-1', score1: 3, score2: 1, completed: true } }),
    // match must include player1Id/player2Id because the source uses them to fetch
    // completed matches and update qualification records for both players
    updateMatch: jest.fn().mockResolvedValue({ match: { id: 'match-1', player1Id: 'player-1', player2Id: 'player-2' }, score1OrPoints1: 3, score2OrPoints2: 1 }),
    calculateMatchResult: jest.fn().mockReturnValue({ result1: 'win', result2: 'loss' }),
    aggregatePlayerStats: jest.fn().mockReturnValue({ qualificationData: { wins: 1, losses: 0, points: 3 } }),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockAuth = auth as jest.MockedFunction<typeof auth>;
    mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;
    mockGetServerSideIdentifier = getServerSideIdentifier as jest.MockedFunction<typeof getServerSideIdentifier>;
    mockSanitizeInput = sanitizeInput as jest.MockedFunction<typeof sanitizeInput>;
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    (createLogger as jest.Mock).mockReturnValue(mockLogger);
    mockSanitizeInput.mockImplementation((input) => input);
    mockCreateAuditLog.mockResolvedValue(undefined);
    mockGetServerSideIdentifier.mockResolvedValue('192.168.1.1');
  });

  // ============================================================
  // GET Handler Tests (1 case)
  // ============================================================

  describe('GET Handler', () => {
    it('should return qualifications and matches successfully', async () => {
      const mockQualifications = [
        { id: 'qual-1', playerId: 'player-1', group: 'A', score: 3, wins: 1, losses: 0 },
        { id: 'qual-2', playerId: 'player-2', group: 'A', score: 1, wins: 0, losses: 1 },
      ];
      const mockMatches = [
        { id: 'match-1', matchNumber: 1, stage: 'qualification', player1Id: 'player-1', player2Id: 'player-2' },
        { id: 'match-2', matchNumber: 2, stage: 'qualification', player1Id: 'player-1', player2Id: 'player-3' },
      ];

      (prisma.bMQualification as any).findMany.mockResolvedValue(mockQualifications);
      (prisma.bMMatch as any).findMany.mockResolvedValue(mockMatches);

      const config = createMockConfig();
      const { GET } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      /* Response now uses createSuccessResponse wrapper (#274) */
      expect(json.success).toBe(true);
      expect(json.data.qualifications).toEqual([
        { ...mockQualifications[0], _rank: 1 },
        { ...mockQualifications[1], _rank: 2 },
      ]);
      expect(json.data.matches).toEqual(mockMatches);
      expect((prisma.bMQualification as any).findMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123' },
        include: { player: true },
        orderBy: config.qualificationOrderBy,
      });
      expect((prisma.bMMatch as any).findMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'qualification' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
    });

    it('should return 500 on database error', async () => {
      (prisma.bMQualification as any).findMany.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig();
      const { GET } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to fetch Battle Mode data');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch Battle Mode data', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });
  });

  // ============================================================
  // POST Handler Tests (8 cases)
  // ============================================================

  describe('POST Handler', () => {
    const createMockPlayers = () => [
      { playerId: 'player-1', group: 'A', seeding: 1 },
      { playerId: 'player-2', group: 'A', seeding: 2 },
      { playerId: 'player-3', group: 'B', seeding: 1 },
      { playerId: 'player-4', group: 'B', seeding: 2 },
    ];

    it('should check authentication when postRequiresAuth is true', async () => {
      mockAuth.mockResolvedValue(null);

      const config = createMockConfig({ postRequiresAuth: true });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players: createMockPlayers() }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('should create round-robin matches from players array', async () => {
      const players = createMockPlayers();

      /*
       * Issue #420: qualification + match creation switched to createMany.
       * Tests now assert one createMany call per model, with the data array
       * matching the expected count and shape.
       */
      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 4 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([{ id: 'qual-1' }]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 2 });

      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);

      // Group A: player-1 vs player-2 (1 match via circle method)
      // Group B: player-3 vs player-4 (1 match via circle method)
      // Total: 4 qualification records (1 createMany call) + 2 matches (1 createMany call)
      expect((prisma.bMQualification as any).createMany).toHaveBeenCalledTimes(1);
      expect((prisma.bMQualification as any).createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ tournamentId: 'tournament-123', playerId: 'player-1', group: 'A' }),
          expect.objectContaining({ tournamentId: 'tournament-123', playerId: 'player-4', group: 'B' }),
        ]),
      });
      const qualCall = (prisma.bMQualification as any).createMany.mock.calls[0][0];
      expect(qualCall.data).toHaveLength(4);

      expect((prisma.bMMatch as any).createMany).toHaveBeenCalledTimes(1);
      const matchCall = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      expect(matchCall.data).toHaveLength(2);
      // Verify match generation includes round-robin fields (roundNumber, player1Side, etc.)
      expect(matchCall.data[0]).toEqual(expect.objectContaining({
        tournamentId: 'tournament-123',
        matchNumber: 1,
        stage: 'qualification',
        roundNumber: 1,
        isBye: false,
        player1Side: 1,
        player2Side: 2,
      }));
    });

    it('should handle multiple groups and generate round-robin matches within each', async () => {
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
        { playerId: 'player-3', group: 'A', seeding: 3 }, // Group A: 3 players, 3 matches (1v2, 1v3, 2v3)
        { playerId: 'player-4', group: 'B', seeding: 1 },
        { playerId: 'player-5', group: 'B', seeding: 2 }, // Group B: 2 players, 1 match (4v5)
      ];

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 5 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 7 });

      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      // Group A: 3 players (odd) → BREAK added → 3 days × 2 matches = 6 (3 real + 3 bye)
      // Group B: 2 players → 1 day × 1 match = 1
      // Total: 6 + 1 = 7 matches inserted in a single createMany call
      const matchCall = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      expect(matchCall.data).toHaveLength(7);
    });

    it('should create audit log when auditAction is configured', async () => {
      const players = createMockPlayers();

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 4 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 2 });
      mockAuth.mockResolvedValue({
        user: {
          id: 'user-1',
          role: 'admin',
        },
      });

      const config = createMockConfig({ postRequiresAuth: true, auditAction: 'SETUP_QUALIFICATION' });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        headers: new Headers({ 'user-agent': 'Mozilla/5.0' }),
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        userId: 'user-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'SETUP_QUALIFICATION',
        targetId: 'tournament-123',
        targetType: 'Tournament',
        details: { mode: 'qualification', playerCount: 4 },
      });
    });

    it('should return 403 when postRequiresAuth and user is not admin', async () => {
      const players = createMockPlayers();

      mockAuth.mockResolvedValue({
        user: {
          id: 'user-1',
          role: 'member',
        },
      });

      const config = createMockConfig({ postRequiresAuth: true });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('should return 400 when players array is empty', async () => {
      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players: [] }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Players array is required');
    });

    it('should return 400 when players is not an array', async () => {
      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players: 'not-an-array' }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Players array is required');
    });

    it('should log warning when audit log creation fails (non-critical)', async () => {
      const players = createMockPlayers();

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 4 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 2 });
      mockAuth.mockResolvedValue({
        user: {
          id: 'user-1',
          role: 'admin',
        },
      });
      mockCreateAuditLog.mockRejectedValue(new Error('Audit DB error'));

      const config = createMockConfig({ postRequiresAuth: true, auditAction: 'SETUP_QUALIFICATION' });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        headers: new Headers({ 'user-agent': 'Mozilla/5.0' }),
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      // POST should still succeed despite audit log failure
      expect(response.status).toBe(201);
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to create audit log', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
        action: 'SETUP_QUALIFICATION',
      });
    });

    it('should apply sanitizeInput to request body', async () => {
      const players = createMockPlayers();

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 4 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 2 });
      mockSanitizeInput.mockImplementation((input) => {
        if (typeof input === 'string') {
          return input.replace(/<script>/g, '');
        }
        return input;
      });

      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(mockSanitizeInput).toHaveBeenCalled();
      expect(response.status).toBe(201);
    });

    it('should update qualification stats for BYE recipients immediately after group setup', async () => {
      /*
       * When a group has odd players, BREAK is added and BYE matches are auto-completed.
       * The BYE recipient's qualification stats (wins/points) must be updated right away
       * so standings reflect the BYE win without waiting for their first real match.
       * Fix: POST handler recalculates stats for each BYE recipient after match creation.
       */
      const players = [
        { playerId: 'player-1', group: 'A' },
        { playerId: 'player-2', group: 'A' },
        { playerId: 'player-3', group: 'A' }, // Odd group → BREAK added → 3 BYE matches generated
      ];

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 3 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 6 });
      /*
       * findMany is called once per BYE recipient to fetch their completed matches.
       * Return a BYE match for each player (simplified - same data for all 3 calls).
       */
      (prisma.bMMatch as any).findMany.mockResolvedValue([
        { id: 'bye-1', player1Id: 'player-1', player2Id: '__BREAK__', score1: 4, score2: 0, completed: true, isBye: true },
      ]);
      (prisma.bMQualification as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      /*
       * In a 3-player group (odd), BREAK is added → 4 participants → 3 days × 2 matches.
       * Each player receives exactly 1 BYE match (player-1, player-2, player-3 all get one).
       * aggregatePlayerStats and updateMany must each be called 3 times (once per BYE recipient).
       */
      expect(config.aggregatePlayerStats).toHaveBeenCalledTimes(3);
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledTimes(3);
      /* Verify each updateMany call targets the correct player via the where clause */
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tournamentId: 'tournament-123' }),
        }),
      );
    });

    it('should sort players by seeding within each group before generating round-robin schedule', async () => {
      /*
       * The circle method uses the first player as the "anchor" position,
       * so placing the top-seeded player first ensures seeding-aware match ordering
       * per requirements §10.4. Players supplied in reverse seeding order must still
       * generate matches with seeding:1 appearing first (as player1 in match 1).
       */
      const playersReverseSeedingOrder = [
        { playerId: 'player-2', group: 'A', seeding: 2 }, // seeding 2 listed first
        { playerId: 'player-1', group: 'A', seeding: 1 }, // seeding 1 listed second
      ];

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 2 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players: playersReverseSeedingOrder }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      // player-1 (seeding:1) must be player1 even though player-2 was listed first.
      const matchCall = (prisma.bMMatch as any).createMany.mock.calls[0][0];
      expect(matchCall.data[0]).toEqual(expect.objectContaining({
        matchNumber: 1,
        player1Id: 'player-1',
        player2Id: 'player-2',
      }));
    });

    // Course assignment tests (§10.5)
    it('should assign 4 pre-assigned courses per match when assignCoursesRandomly is true', async () => {
      /*
       * When assignCoursesRandomly is true (MR config), each match creation call
       * must include an `assignedCourses` field with exactly 4 course abbreviations
       * from the COURSES constant. The actual order is random, so we only verify
       * the structure (array of 4 valid course strings).
       */
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
      ];

      (prisma.mRQualification as any) = {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      (prisma.mRMatch as any) = {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const config = createMockConfig({
        eventTypeCode: 'mr',
        matchModel: 'mRMatch',
        qualificationModel: 'mRQualification',
        assignCoursesRandomly: true,
      });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      // Each match must have assignedCourses: array of 4 course abbreviations
      const createCall = (prisma.mRMatch as any).createMany.mock.calls[0];
      expect(createCall[0].data[0]).toEqual(expect.objectContaining({
        assignedCourses: expect.arrayContaining([expect.any(String)]),
      }));
      expect(createCall[0].data[0].assignedCourses).toHaveLength(4);
    });

    // Cup assignment tests (§7.4)
    it('should assign a cup to each match when assignCupRandomly is true (GP)', async () => {
      /*
       * When assignCupRandomly is true (GP config), each match creation call
       * must include a `cup` field with a value from the cupList.
       * The actual order is random (Fisher-Yates shuffle), so we only verify
       * the value is one of the valid cups.
       */
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
      ];

      const cupList = ['Mushroom', 'Flower', 'Star', 'Special'] as const;

      (prisma.gPQualification as any) = {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      (prisma.gPMatch as any) = {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      };

      const config = createMockConfig({
        eventTypeCode: 'gp',
        matchModel: 'gPMatch',
        qualificationModel: 'gPQualification',
        assignCupRandomly: true,
        cupList,
      });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      // Each match must have a cup field with a valid cup name
      const createCall = (prisma.gPMatch as any).createMany.mock.calls[0];
      expect(createCall[0].data[0].cup).toBeDefined();
      expect(cupList).toContain(createCall[0].data[0].cup);
    });

    it('should cycle cups via modulo when there are more matches than cups', async () => {
      /*
       * With 3 players in one group (odd → BREAK added → 4 participants → 6 matches),
       * 4 cups must cycle: match0→cup[0], match1→cup[1], ..., match4→cup[0] (wraps).
       */
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
        { playerId: 'player-3', group: 'A', seeding: 3 },
      ];

      const cupList = ['Mushroom', 'Flower', 'Star', 'Special'] as const;

      (prisma.gPQualification as any) = {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      (prisma.gPMatch as any) = {
        createMany: jest.fn().mockResolvedValue({ count: 6 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'bye-1', player1Id: 'player-1', player2Id: '__BREAK__', score1: 45, score2: 0, completed: true, isBye: true },
        ]),
      };

      const config = createMockConfig({
        eventTypeCode: 'gp',
        matchModel: 'gPMatch',
        qualificationModel: 'gPQualification',
        assignCupRandomly: true,
        cupList,
      });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      // 3 players (odd) → BREAK added → 4 participants → 3 days × 2 matches = 6 matches
      const createCall = (prisma.gPMatch as any).createMany.mock.calls[0];
      expect(createCall[0].data.length).toBe(6);

      // BYE matches are auto-completed and skip cup assignment, so only real
      // matches carry a cup. Filter out the byes before asserting cup coverage.
      const realMatchCups = createCall[0].data
        .filter((m: any) => !m.isBye)
        .map((m: any) => m.cup);
      realMatchCups.forEach((cup: string) => {
        expect(cupList).toContain(cup);
      });
      // With 3 real matches drawn from 4 shuffled cups, all should be unique.
      const uniqueCups = new Set(realMatchCups);
      expect(uniqueCups.size).toBe(realMatchCups.length);
    });

    it('should NOT assign cup when assignCupRandomly is not set (BM/MR)', async () => {
      /*
       * BM and MR configs do not set assignCupRandomly, so match creation
       * must NOT include a `cup` field.
       */
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
      ];

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 2 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 1 });

      // Default BM config has no assignCupRandomly
      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      // No cup for BM matches
      const createCall = (prisma.bMMatch as any).createMany.mock.calls[0];
      expect(createCall[0].data[0].cup).toBeUndefined();
    });

    it('should NOT assign courses when assignCoursesRandomly is false (BM/GP)', async () => {
      /*
       * BM and GP configs do not set assignCoursesRandomly, so match creation
       * must NOT include an `assignedCourses` field.
       */
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
      ];

      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 2 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma.bMMatch as any).createMany.mockResolvedValue({ count: 1 });

      // Default BM config has no assignCoursesRandomly
      const config = createMockConfig();
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      await POST(request, { params: Promise.resolve({ id: 'tournament-123' }) });

      // No assignedCourses for BM matches
      const createCall = (prisma.bMMatch as any).createMany.mock.calls[0];
      expect(createCall[0].data[0].assignedCourses).toBeUndefined();
    });

    it('should succeed on re-setup when qualifications already exist (group edit)', async () => {
      /*
       * Regression test for "Failed to setup match race" bug.
       * When a user clicks グループ編集 to re-edit groups, the same playerIds
       * are submitted again. MRQualification has @@unique([tournamentId, playerId])
       * and MRMatch has @@unique([tournamentId, matchNumber, stage]), so a
       * create-before-delete pattern hits a unique-constraint violation and
       * returns 500. The fix: delete existing records first, then create new ones
       * (matches the finals-route.ts pattern from commit 7c7e57d / TC-504).
       */
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
      ];

      (prisma.mRQualification as any).createMany.mockResolvedValue({ count: 2 });
      (prisma.mRQualification as any).findMany.mockResolvedValue([]);
      (prisma.mRQualification as any).deleteMany.mockResolvedValue({ count: 2 });
      (prisma.mRMatch as any).createMany.mockResolvedValue({ count: 1 });
      (prisma.mRMatch as any).deleteMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig({
        eventTypeCode: 'mr',
        matchModel: 'mRMatch',
        qualificationModel: 'mRQualification',
        eventDisplayName: 'match race',
      });
      const { POST } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify({ players }),
      });
      const response = await POST(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(201);
      /* Both deletes scoped to tournament must run before any create */
      expect((prisma.mRQualification as any).deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123' },
      });
      expect((prisma.mRMatch as any).deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', stage: 'qualification' },
      });
      /* Verify delete-before-create order via mock invocation timing */
      const qualDeleteOrder = (prisma.mRQualification as any).deleteMany.mock.invocationCallOrder[0];
      const qualCreateOrder = (prisma.mRQualification as any).createMany.mock.invocationCallOrder[0];
      const matchDeleteOrder = (prisma.mRMatch as any).deleteMany.mock.invocationCallOrder[0];
      const matchCreateOrder = (prisma.mRMatch as any).createMany.mock.invocationCallOrder[0];
      expect(qualDeleteOrder).toBeLessThan(qualCreateOrder);
      expect(matchDeleteOrder).toBeLessThan(matchCreateOrder);
    });
  });

  // ============================================================
  // PUT Handler Tests (10 cases)
  // ============================================================

  describe('PUT Handler', () => {
    const createMockRequestBody = () => ({
      matchId: 'match-123',
      score1: 3,
      score2: 1,
      completed: true,
    });

    it('should update match when parsePutBody returns valid', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = { id: 'match-123', player1Id: 'player-1', player2Id: 'player-2' };
      const mockPlayer1Matches = [mockMatch];
      const mockPlayer2Matches = [mockMatch];

      (prisma.bMMatch as any).findMany
        .mockResolvedValueOnce(mockPlayer1Matches)
        .mockResolvedValueOnce(mockPlayer2Matches);
      (prisma.bMQualification as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig();
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(config.parsePutBody).toHaveBeenCalledWith(requestBody);
      // updateMatch receives parsePutBody's parsed data, not the raw request body.
      // parsePutBody mock returns data with matchId: 'match-1' (not the raw 'match-123').
      expect(config.updateMatch).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          matchId: 'match-1',
          score1: 3,
          score2: 1,
        })
      );
      expect(config.calculateMatchResult).toHaveBeenCalledWith(3, 1);
      expect(response.status).toBe(200);
    });

    it('should calculate match result via config.calculateMatchResult', async () => {
      const requestBody = createMockRequestBody();

      (prisma.bMMatch as any).findMany.mockResolvedValue([]);
      (prisma.bMQualification as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig({
        calculateMatchResult: jest.fn().mockReturnValue({ result1: 'WIN', result2: 'LOSS' }),
      });
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(config.calculateMatchResult).toHaveBeenCalledWith(3, 1);
      const json = await response.json();
      expect(json.data.result1).toBe('WIN');
      expect(json.data.result2).toBe('LOSS');
    });

    it('should aggregate player stats via config.aggregatePlayerStats', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = { id: 'match-123', player1Id: 'player-1', player2Id: 'player-2' };
      const mockPlayer1Matches = [mockMatch];
      const mockPlayer2Matches = [mockMatch];

      (prisma.bMMatch as any).findMany
        .mockResolvedValueOnce(mockPlayer1Matches)
        .mockResolvedValueOnce(mockPlayer2Matches);
      (prisma.bMQualification as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig({
        aggregatePlayerStats: jest.fn().mockReturnValue({
          qualificationData: { wins: 1, losses: 0, points: 3 },
        }),
      });
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(config.aggregatePlayerStats).toHaveBeenCalledTimes(2);
      expect(config.aggregatePlayerStats).toHaveBeenCalledWith(mockPlayer1Matches, 'player-1', config.calculateMatchResult);
      expect(config.aggregatePlayerStats).toHaveBeenCalledWith(mockPlayer2Matches, 'player-2', config.calculateMatchResult);
    });

    it('should update both players qualification records', async () => {
      const requestBody = createMockRequestBody();
      const mockMatch = { id: 'match-123', player1Id: 'player-1', player2Id: 'player-2' };

      (prisma.bMMatch as any).findMany.mockResolvedValue([]);
      (prisma.bMQualification as any).updateMany.mockResolvedValue({ count: 1 });

      const config = createMockConfig({
        aggregatePlayerStats: jest.fn().mockReturnValue({
          qualificationData: { wins: 1, losses: 0, points: 3 },
        }),
      });
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledTimes(2);
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', playerId: 'player-1' },
        data: { wins: 1, losses: 0, points: 3 },
      });
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', playerId: 'player-2' },
        data: { wins: 1, losses: 0, points: 3 },
      });
    });

    it('should return 400 when parsePutBody returns invalid', async () => {
      const requestBody = createMockRequestBody();

      const config = createMockConfig({
        parsePutBody: jest.fn().mockReturnValue({ valid: false, error: 'Invalid score values' }),
      });
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Invalid score values');
    });

    it('should return 500 when updateMatch throws an exception', async () => {
      const requestBody = createMockRequestBody();

      const config = createMockConfig({
        updateMatch: jest.fn().mockRejectedValue(new Error('Update failed')),
      });
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update match', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });

    it('should return 500 when player1Matches fetch fails', async () => {
      const requestBody = createMockRequestBody();

      (prisma.bMMatch as any).findMany.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig();
      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update match', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });

    it('should return 403 when putRequiresAuth and user is not authenticated', async () => {
      const requestBody = createMockRequestBody();

      mockAuth.mockResolvedValue(null);

      const config = createMockConfig({ putRequiresAuth: true });
      const { PUT } = createQualificationHandlers(config);

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

    it('should return 403 when putRequiresAuth and user is not admin', async () => {
      const requestBody = createMockRequestBody();

      mockAuth.mockResolvedValue({
        user: {
          id: 'user-1',
          role: 'member',
        },
      });

      const config = createMockConfig({ putRequiresAuth: true });
      const { PUT } = createQualificationHandlers(config);

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

    // NOTE: Rate limiting test removed - qualification-route.ts does not implement rate limiting
    // The getServerSideIdentifier import exists but rate limit check is not implemented in the route

    it('should skip player2 recalculation for BYE matches', async () => {
      const requestBody = { matchId: 'bye-match-1', score1: 4, score2: 0, completed: true };

      /* updateMatch returns a BYE match (isBye: true, player2Id is BREAK) */
      const config = createMockConfig({
        updateMatch: jest.fn().mockResolvedValue({
          match: { id: 'bye-match-1', player1Id: 'player-1', player2Id: '__BREAK__', isBye: true },
          score1OrPoints1: 4,
          score2OrPoints2: 0,
        }),
      });

      (prisma.bMMatch as any).findMany.mockResolvedValue([]);
      (prisma.bMQualification as any).updateMany.mockResolvedValue({ count: 1 });

      const { PUT } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);

      /*
       * For BYE matches, only player1's stats should be recalculated.
       * player2 (BREAK) has no qualification record, so aggregation is skipped.
       */
      expect(config.aggregatePlayerStats).toHaveBeenCalledTimes(1);
      expect(config.aggregatePlayerStats).toHaveBeenCalledWith(
        expect.anything(), 'player-1', config.calculateMatchResult,
      );
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledTimes(1);
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-123', playerId: 'player-1' },
        data: expect.any(Object),
      });
    });
  });

  // ============================================================
  // PATCH Handler Tests (6 cases)
  // ============================================================

  describe('PATCH Handler', () => {
    it('should return 403 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 1 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe('Forbidden');
    });

    it('should return 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'member' } });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 1 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
    });

    it('should return 400 when matchId is missing', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ tvNumber: 1 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('matchId is required');
    });

    it('should return 400 when tvNumber is invalid (negative, fractional)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      /* Negative number */
      let request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: -1 }),
      });
      let response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });
      expect(response.status).toBe(400);

      /* Fractional number */
      request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 1.5 }),
      });
      response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });
      expect(response.status).toBe(400);
    });

    it('should update TV number successfully with tournamentId constraint', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } });

      const mockMatch = {
        id: 'match-1',
        tvNumber: 2,
        player1: { id: 'p1', nickname: 'Alice' },
        player2: { id: 'p2', nickname: 'Bob' },
      };
      /* PATCH now short-circuits with 404 when the match doesn't belong to
       * the tournament (IDOR prevention via findFirst). Provide a stub so
       * the update path runs. */
      (prisma.bMMatch as any).findFirst.mockResolvedValue(mockMatch);
      (prisma.bMMatch as any).update.mockResolvedValue(mockMatch);

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 2 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.match).toEqual(mockMatch);

      /* Verify tournamentId is included in the where clause (IDOR prevention) */
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: 'match-1', tournamentId: 'tournament-123' },
        data: { tvNumber: 2 },
        include: { player1: true, player2: true },
      });
    });

    it('should set tvNumber to null when removing assignment', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } });

      const mockMatch = { id: 'match-1', tvNumber: null };
      (prisma.bMMatch as any).findFirst.mockResolvedValue({ id: 'match-1', tvNumber: 5 });
      (prisma.bMMatch as any).update.mockResolvedValue(mockMatch);

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: null }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect((prisma.bMMatch as any).update).toHaveBeenCalledWith({
        where: { id: 'match-1', tournamentId: 'tournament-123' },
        data: { tvNumber: null },
        include: { player1: true, player2: true },
      });
    });

    it('should apply sanitizeInput to request body', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } });
      (prisma.bMMatch as any).update.mockResolvedValue({ id: 'match-1' });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 1 }),
      });
      await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      /* sanitizeInput should be called on the parsed request body */
      expect(mockSanitizeInput).toHaveBeenCalled();
    });

    it('should return 400 when both qualificationId and matchId are provided', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ qualificationId: 'qual-1', matchId: 'match-1', rankOverride: 2, tvNumber: 1 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Provide either qualificationId or matchId, not both');
    });

    // === Rank override path (qualificationId present) ===

    it('should update rankOverride when qualificationId is provided', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });

      const mockQual = { id: 'qual-1', rankOverride: 2, rankOverrideBy: 'admin-1' };
      (prisma.bMQualification as any).update = jest.fn().mockResolvedValue(mockQual);

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ qualificationId: 'qual-1', rankOverride: 2 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.qualification).toEqual(mockQual);

      /* Verify IDOR-safe where clause and audit fields are written */
      expect((prisma.bMQualification as any).update).toHaveBeenCalledWith({
        where: { id: 'qual-1', tournamentId: 'tournament-123' },
        data: {
          rankOverride: 2,
          rankOverrideBy: 'admin-1',
          rankOverrideAt: expect.any(Date),
        },
      });
    });

    it('should clear rankOverride when rankOverride=null is provided', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });

      const mockQual = { id: 'qual-1', rankOverride: null, rankOverrideBy: null };
      (prisma.bMQualification as any).update = jest.fn().mockResolvedValue(mockQual);

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ qualificationId: 'qual-1', rankOverride: null }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      /* Clearing override: rankOverrideBy and rankOverrideAt must also be cleared */
      expect((prisma.bMQualification as any).update).toHaveBeenCalledWith({
        where: { id: 'qual-1', tournamentId: 'tournament-123' },
        data: {
          rankOverride: null,
          rankOverrideBy: null,
          rankOverrideAt: null,
        },
      });
    });

    it('should return 400 when rankOverride is fractional', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ qualificationId: 'qual-1', rankOverride: 1.5 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('rankOverride must be a positive integer or null');
    });

    it('should return 400 when rankOverride is zero or negative', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ qualificationId: 'qual-1', rankOverride: 0 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 500 on database error', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'admin' } });
      (prisma.bMMatch as any).update.mockRejectedValue(new Error('DB error'));

      const config = createMockConfig();
      const { PATCH } = createQualificationHandlers(config);

      const request = new NextRequest('http://localhost:3000', {
        method: 'PATCH',
        body: JSON.stringify({ matchId: 'match-1', tvNumber: 1 }),
      });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('Failed to update');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });
  });
});
