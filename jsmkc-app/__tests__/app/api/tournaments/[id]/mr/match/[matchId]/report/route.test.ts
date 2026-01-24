// @ts-nocheck
jest.mock('@/lib/prisma', () => ({
  default: {
    mRMatch: { findUnique: jest.fn(), update: jest.fn() },
    scoreEntryLog: { create: jest.fn() },
    matchCharacterUsage: { create: jest.fn() },
  },
}));

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ 
  rateLimit: jest.fn(),
  getClientIdentifier: jest.fn(),
  getUserAgent: jest.fn()
}));
jest.mock('@/lib/token-validation', () => ({ validateTournamentToken: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/constants', () => ({ SMK_CHARACTERS: ['Mario', 'Luigi', 'Yoshi'] }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { rateLimit, getClientIdentifier, getUserAgent } from '@/lib/rate-limit';
import { validateTournamentToken } from '@/lib/token-validation';
import { createAuditLog } from '@/lib/audit-log';
import { POST } from '@/app/api/tournaments/[id]/mr/match/[matchId]/report/route';

const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

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

describe('MR Score Report API Route - /api/tournaments/[id]/mr/match/[matchId]/report', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
    getClientIdentifier.mockResolvedValue('test-ip');
    getUserAgent.mockReturnValue('test-agent');
    rateLimit.mockResolvedValue({ success: true });
  });

  describe('POST - Report match score', () => {
    // Success case - Report score with tournament token
    it('should report score successfully with valid tournament token', async () => {
      const mockMatch = {
        id: 'm1',
        tournamentId: 't1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ success: true, match: mockMatch });
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          player1ReportedPoints1: 3,
          player1ReportedPoints2: 1,
        },
      });
    });

    // Success case - Report score with authenticated player
    it('should report score successfully for authenticated player', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: 3,
        player2ReportedPoints2: 1,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      const mockSession = { user: { id: 'u1', userType: 'player', playerId: 'p1' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: null });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      (createAuditLog as jest.Mock).mockResolvedValue({});
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.mRMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          score1: 3,
          score2: 1,
          rounds: null,
          completed: true,
        },
      });
    });

    // Success case - Report score with OAuth linked player
    it('should report score successfully for OAuth linked player', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: 3,
        player1ReportedPoints2: 1,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      const mockSession = { user: { id: 'u1' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: null });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
    });

    // Success case - Report score with character
    it('should report score with valid character', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({});
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1, character: 'Mario' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.matchCharacterUsage.create).toHaveBeenCalledWith({
        data: {
          matchId: 'm1',
          matchType: 'MR',
          playerId: 'p1',
          character: 'Mario',
        },
      });
    });

    // Rate limit error case - Returns 429 when rate limit exceeded
    it('should return 429 when rate limit is exceeded', async () => {
      (rateLimit as jest.Mock).mockResolvedValue({ success: false });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Too many requests. Please try again later.' });
      expect(result.status).toBe(429);
    });

    // Validation error case - Returns 400 when character is invalid
    it('should return 400 when character is invalid', async () => {
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1, character: 'InvalidChar' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Invalid character' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 404 when match not found
    it('should return 404 when match does not exist', async () => {
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(null);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/nonexistent/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Match not found' });
      expect(result.status).toBe(404);
    });

    // Authentication failure case - Returns 401 when not authorized
    it('should return 401 when user is not authorized', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      const mockSession = { user: { id: 'u3', userType: 'player', playerId: 'p3' } };
      (auth as jest.Mock).mockResolvedValue(mockSession);
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: null });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ success: false, error: 'Unauthorized: Invalid token or not authorized for this match' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 400 when reportingPlayer is missing
    it('should return 400 when reportingPlayer is missing', async () => {
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'reportingPlayer, score1, and score2 are required' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when reportingPlayer is invalid
    it('should return 400 when reportingPlayer is not 1 or 2', async () => {
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue({ id: 'm1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 3, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'reportingPlayer must be 1 or 2' });
      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to report score' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to report score', { error: expect.any(Error), tournamentId: 't1', matchId: 'm1' });
    });

    // Edge case - Score entry log failure is non-critical
    it('should continue when score entry log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockRejectedValue(new Error('Log error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1 });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create score entry log', expect.any(Object));
    });

    // Edge case - Character usage log failure is non-critical
    it('should continue when character usage log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player1: { id: 'p1', userId: 'u1' },
        player2: { id: 'p2', userId: 'u2' },
      };
      
      (validateTournamentToken as jest.Mock).mockResolvedValue({ tournament: { id: 't1' } });
      (prisma.mRMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.mRMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({});
      (prisma.matchCharacterUsage.create as jest.Mock).mockRejectedValue(new Error('Char log error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/match/m1/report', { reportingPlayer: 1, score1: 3, score2: 1, character: 'Mario' });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create character usage log', expect.any(Object));
    });
  });
});
