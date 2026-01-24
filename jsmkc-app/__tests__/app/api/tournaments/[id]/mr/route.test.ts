// @ts-nocheck


jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/mr/route';

const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

// Mock NextRequest class
class MockNextRequest {
  constructor(
    private url: string,
    private body?: Record<string, unknown>,
    private headers: Map<string, string> = new Map()
  ) {}
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('MR API Route - /api/tournaments/[id]/mr', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: unknown, options?: { status?: number }) => ({ data, status: options?.status || 200 }));
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
      
      expect(result.data).toEqual({ qualifications: mockQualifications, matches: mockMatches });
      expect(result.status).toBe(200);
      expect(prisma.mRQualification.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1' },
        include: { player: true },
        orderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
      });
      expect(prisma.mRMatch.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'qualification' },
        include: { player1: true, player2: true },
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
      
      expect(result.data).toEqual({ qualifications: [], matches: [] });
      expect(result.status).toBe(200);
    });

    // Error case - Returns 500 when database query fails
    it('should return 500 error when database query fails', async () => {
      (prisma.mRQualification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr');
      const params = Promise.resolve({ id: 't1' });
      const result = await GET(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to fetch match race data' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to fetch MR data', { error: expect.any(Error), tournamentId: 't1' });
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
      const mockPlayers = [
        { playerId: 'p1', group: 'A', seeding: 1 },
        { playerId: 'p2', group: 'A', seeding: 2 },
      ];
      const mockQualifications = [{ id: 'q1', tournamentId: 't1', playerId: 'p1', group: 'A' }];
      
      (prisma.mRQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ message: 'Match race setup complete', qualifications: expect.any(Array) });
      expect(result.status).toBe(201);
      expect(prisma.mRQualification.create).toHaveBeenCalledTimes(2);
      expect(prisma.mRMatch.create).toHaveBeenCalledTimes(1);
    });

    // Success case - Handles multiple groups correctly
    it('should generate matches for multiple groups separately', async () => {
      const mockPlayers = [
        { playerId: 'p1', group: 'A' },
        { playerId: 'p2', group: 'A' },
        { playerId: 'p3', group: 'B' },
        { playerId: 'p4', group: 'B' },
      ];
      
      (prisma.mRQualification.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: mockPlayers });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(201);
      expect(prisma.mRMatch.create).toHaveBeenCalledTimes(2);
    });

    // Validation error case - Returns 400 when players array is missing
    it('should return 400 when players array is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', {});
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is not an array
    it('should return 400 when players is not an array', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: 'not-an-array' });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when players array is empty
    it('should return 400 when players array is empty', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Players array is required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRMatch.create as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { players: [{ playerId: 'p1', group: 'A' }] });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to setup match race' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to setup MR', { error: expect.any(Error), tournamentId: 't1' });
    });
  });

  describe('PUT - Update match score', () => {
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
      
      const mockPlayer1Matches = [mockMatch];
      const mockPlayer2Matches = [mockMatch];
      
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mRQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ match: mockMatch, result1: 'win', result2: 'loss' });
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { score1: 3, score2: 1, rounds: null, completed: true },
        include: { player1: true, player2: true },
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
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1, rounds: [1, 2, 3, 4] });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { score1: 3, score2: 1, rounds: [1, 2, 3, 4], completed: true },
        include: { player1: true, player2: true },
      });
    });

    // Validation error case - Returns 400 when matchId is missing
    it('should return 400 when matchId is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score1 is missing
    it('should return 400 when score1 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when score2 is missing
    it('should return 400 when score2 is missing', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'matchId, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (prisma.mRMatch.update as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr', { matchId: 'm1', score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1' });
      const result = await PUT(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to update match' });
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
