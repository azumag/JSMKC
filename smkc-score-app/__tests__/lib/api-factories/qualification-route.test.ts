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
jest.mock('@/lib/rate-limit');
jest.mock('@/lib/sanitize');
jest.mock('@/lib/logger');

import { auth } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Qualification Route Factory', () => {
  let mockAuth: jest.MockedFunction<typeof auth>;
  let mockCreateAuditLog: jest.MockedFunction<typeof createAuditLog>;
  let mockGetServerSideIdentifier: jest.MockedFunction<typeof getServerSideIdentifier>;
  let mockSanitizeInput: jest.MockedFunction<typeof sanitizeInput>;
  let mockLogger: ReturnType<typeof createLogger>;

  const createMockConfig = (overrides = {}): EventTypeConfig => ({
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
      expect(json.qualifications).toEqual(mockQualifications);
      expect(json.matches).toEqual(mockMatches);
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

      (prisma.bMQualification as any).create.mockResolvedValue({ id: 'qual-1' });
      (prisma.bMMatch as any).create.mockResolvedValue({ id: 'match-1' });

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
      // Total: 4 qualification records + 2 matches
      expect((prisma.bMQualification as any).create).toHaveBeenCalledTimes(4);
      expect((prisma.bMMatch as any).create).toHaveBeenCalledTimes(2);

      // Verify match generation includes round-robin fields (roundNumber, player1Side, etc.)
      expect((prisma.bMMatch as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tournamentId: 'tournament-123',
          matchNumber: 1,
          stage: 'qualification',
          roundNumber: 1,
          isBye: false,
          player1Side: 1,
          player2Side: 2,
        }),
      });
    });

    it('should handle multiple groups and generate round-robin matches within each', async () => {
      const players = [
        { playerId: 'player-1', group: 'A', seeding: 1 },
        { playerId: 'player-2', group: 'A', seeding: 2 },
        { playerId: 'player-3', group: 'A', seeding: 3 }, // Group A: 3 players, 3 matches (1v2, 1v3, 2v3)
        { playerId: 'player-4', group: 'B', seeding: 1 },
        { playerId: 'player-5', group: 'B', seeding: 2 }, // Group B: 2 players, 1 match (4v5)
      ];

      (prisma.bMQualification as any).create.mockResolvedValue({ id: 'qual-1' });
      (prisma.bMMatch as any).create.mockResolvedValue({ id: 'match-1' });

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
      // Total: 6 + 1 = 7
      expect((prisma.bMMatch as any).create).toHaveBeenCalledTimes(7);
    });

    it('should create audit log when auditAction is configured', async () => {
      const players = createMockPlayers();

      (prisma.bMQualification as any).create.mockResolvedValue({ id: 'qual-1' });
      (prisma.bMMatch as any).create.mockResolvedValue({ id: 'match-1' });
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

      (prisma.bMQualification as any).create.mockResolvedValue({ id: 'qual-1' });
      (prisma.bMMatch as any).create.mockResolvedValue({ id: 'match-1' });
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

      (prisma.bMQualification as any).create.mockResolvedValue({ id: 'qual-1' });
      (prisma.bMMatch as any).create.mockResolvedValue({ id: 'match-1' });
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

      (prisma.bMQualification as any).create.mockResolvedValue({ id: 'qual-1' });
      (prisma.bMMatch as any).create.mockResolvedValue({ id: 'match-1' });
      // Each BYE recipient's completed matches (including the BYE) are queried for recalculation
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

      // aggregatePlayerStats should be called for each BYE recipient (3 BYE matches in a 3-player group)
      expect(config.aggregatePlayerStats).toHaveBeenCalledTimes(3);
      // updateMany should be called to persist the BYE win stats
      expect((prisma.bMQualification as any).updateMany).toHaveBeenCalled();
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
      expect(json.result1).toBe('WIN');
      expect(json.result2).toBe('LOSS');
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
      expect(json.match).toEqual(mockMatch);

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
      expect(json.error).toBe('Failed to update TV number');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update TV number', {
        error: expect.any(Error),
        tournamentId: 'tournament-123',
      });
    });
  });
});
