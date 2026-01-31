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


jest.mock('@/lib/double-elimination', () => ({
  generateBracketStructure: jest.fn(() => []),
  roundNames: ['Quarter Finals', 'Semi Finals', 'Finals'],
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { generateBracketStructure } from '@/lib/double-elimination';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/mr/finals/route';

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
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
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

      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue(mockMatches);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });

      expect(result.data).toEqual({
        matches: mockMatches,
        bracketStructure: expect.any(Array),
        roundNames: ['Quarter Finals', 'Semi Finals', 'Finals'],
      });
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });
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

      expect(result.data).toEqual({ error: 'Failed to fetch finals data' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch finals data', { error: expect.any(Error), tournamentId: 't1' });
    });
  });

  describe('POST - Create finals bracket', () => {
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
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue({ id: 'm1', player1: { id: 'p1' }, player2: { id: 'p8' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({
        message: 'Finals bracket created',
        matches: expect.any(Array),
        seededPlayers: expect.any(Array),
        bracketStructure: expect.any(Array),
      });
      // Source returns 200, not 201 for finals bracket creation
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.create).toHaveBeenCalled();
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
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue({ id: 'm1', player1: { id: 'p1' }, player2: { id: 'p8' } });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      // Source returns 200 for finals bracket creation
      expect(result.status).toBe(200);
    });

    // Validation error case - Returns 400 when topN is not 8
    it('should return 400 when topN is not 8', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 16 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Currently only 8-player brackets are supported' });
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

      expect(result.data).toEqual({ error: 'Not enough players qualified. Need 8, found 7' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { topN: 8 });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Failed to create finals bracket' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to create finals', { error: expect.any(Error), tournamentId: 't1' });
    });
  });

  describe('PUT - Update finals match', () => {
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

      const mockUpdatedMatch = { ...mockMatch, score1: 3, score2: 1, completed: true };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm5' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
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

      const mockUpdatedMatch = { ...mockMatch, score1: 3, score2: 1, completed: true };

      /* Override bracket structure to include the grand final match at matchNumber 15 */
      (generateBracketStructure as jest.Mock).mockReturnValue([
        { matchNumber: 15, round: 'grand_final', player1Seed: null, player2Seed: null, winnerGoesTo: null, loserGoesTo: null, position: 1 },
      ]);

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue({ id: 'm16', round: 'grand_final_reset' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
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

      expect(result.data).toEqual({ error: 'Finals match not found' });
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

      expect(result.data).toEqual({ error: 'Finals match not found' });
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

      expect(result.data).toEqual({ error: 'Match must have a winner (best of 5: first to 3)' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when required fields missing
    it('should return 400 when required fields are missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.data).toEqual({ error: 'Failed to update match' });
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

      const mockUpdatedMatch = { ...mockMatch, score1: 3, score2: 1, completed: true };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'm5' })
        .mockResolvedValueOnce({ id: 'm9' });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm1', score1: 3, score2: 1 });
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

      const mockUpdatedMatch = { ...mockMatch, score1: 1, score2: 3, completed: true };
      const mockResetMatch = { id: 'm16', round: 'grand_final_reset' };

      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockUpdatedMatch);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(mockResetMatch);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals', { matchId: 'm15', score1: 1, score2: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });

      expect(result.status).toBe(200);
    });
  });
});
