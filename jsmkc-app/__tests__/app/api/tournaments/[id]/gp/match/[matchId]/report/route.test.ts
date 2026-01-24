// @ts-nocheck


jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(),
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'Test UserAgent'),
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/constants', () => ({ SMK_CHARACTERS: ['mario', 'luigi', 'peach', 'toad', 'yoshi', 'bowser', 'donkey_kong', 'koopa'] }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { POST } from '@/app/api/tournaments/[id]/gp/match/[matchId]/report/route';
import { rateLimit, getClientIdentifier, getUserAgent } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit-log';

const NextResponseMock = jest.requireMock('next/server') as { NextResponse: { json: jest.Mock } };

class MockNextRequest {
  constructor(
    private url: string,
    private body?: any,
    private headers: Map<string, string> = new Map()
  ) {
    if (!headers.get('user-agent')) {
      headers.set('user-agent', 'Test UserAgent');
    }
  }
  async json() { return this.body; }
  get header() { return { get: (key: string) => this.headers.get(key) }; }
  headers = {
    get: (key: string) => this.headers.get(key)
  };
}

describe('GP Score Report API Route - /api/tournaments/[id]/gp/match/[matchId]/report', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    (rateLimit as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('POST - Report score for grand prix match', () => {
    // Success case - Reports score from player 1
    it('should report score from player 1 and wait for player 2', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player1ReportedRaces: [],
      };
      
      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Donut Plains 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Ghost Valley 1', position1: 1, position2: 2, points1: 9, points2: 6 },
        { course: 'Bowser Castle 1', position1: 1, position2: 2, points1: 9, points2: 6 },
      ];
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(updatedMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: races.map(r => ({ course: r.course, position1: r.position1, position2: r.position2 })),
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({
        message: 'Score reported successfully',
        match: updatedMatch,
        waitingFor: 'player2',
      });
      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          player1ReportedPoints1: 36,
          player1ReportedPoints2: 24,
          player1ReportedRaces: expect.any(Array),
        },
      });
      expect(createAuditLog).toHaveBeenCalledWith({
        ipAddress: '127.0.0.1',
        userAgent: 'Test UserAgent',
        action: 'REPORT_GP_SCORE',
        targetId: 'm1',
        targetType: 'GPMatch',
        details: {
          tournamentId: 't1',
          reportingPlayer: 1,
          points1: 36,
          points2: 24,
        },
      });
    });

    // Success case - Reports score from player 2
    it('should report score from player 2 and wait for player 1', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player2ReportedPoints1: 6,
        player2ReportedPoints2: 18,
        player2ReportedRaces: [],
      };
      
      const races = [
        { course: 'Mario Circuit 1', position1: 2, position2: 1 },
        { course: 'Donut Plains 1', position1: 2, position2: 1 },
        { course: 'Ghost Valley 1', position1: 2, position2: 1 },
        { course: 'Bowser Castle 1', position1: 2, position2: 1 },
      ];
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 2,
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({
        message: 'Score reported successfully',
        match: updatedMatch,
        waitingFor: 'player1',
      });
      expect(result.status).toBe(200);
      expect(prisma.gPMatch.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: {
          player2ReportedPoints1: 24,
          player2ReportedPoints2: 36,
          player2ReportedRaces: expect.any(Array),
        },
      });
    });

    // Success case - Auto-confirms when both reports match
    it('should auto-confirm match when both players report matching scores', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
        player1ReportedRaces: [],
        player2ReportedRaces: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player2ReportedPoints1: 18,
        player2ReportedPoints2: 6,
        player2ReportedRaces: [],
      };
      
      const confirmedMatch = {
        ...updatedMatch,
        points1: 18,
        points2: 6,
        completed: true,
        player1: { id: 'p1', name: 'Player 1' },
        player2: { id: 'p2', name: 'Player 2' },
      };
      
      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2 },
        { course: 'Donut Plains 1', position1: 1, position2: 2 },
        { course: 'Ghost Valley 1', position1: 1, position2: 2 },
        { course: 'Bowser Castle 1', position1: 1, position2: 2 },
      ];
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(updatedMatch)
        .mockResolvedValueOnce(confirmedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(confirmedMatch);
      (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.gPQualification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 2,
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({
        message: 'Scores confirmed and match completed',
        match: confirmedMatch,
        autoConfirmed: true,
      });
      expect(result.status).toBe(200);
      expect(prisma.gPQualification.updateMany).toHaveBeenCalledTimes(2);
    });

    // Success case - Reports mismatch detected
    it('should detect and report score mismatch between players', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player2ReportedPoints1: 12,
        player2ReportedPoints2: 12,
        player1ReportedRaces: [],
        player2ReportedRaces: [],
      };
      
      const races = [
        { course: 'Mario Circuit 1', position1: 2, position2: 1 },
        { course: 'Donut Plains 1', position1: 2, position2: 2 },
        { course: 'Ghost Valley 1', position1: 2, position2: 1 },
        { course: 'Bowser Castle 1', position1: 2, position2: 2 },
      ];
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({
        message: 'Score reported but mismatch detected - awaiting admin review',
        match: mockMatch,
        mismatch: true,
        player1Report: { points1: 18, points2: 6 },
        player2Report: { points1: 12, points2: 12 },
      });
      expect(result.status).toBe(200);
    });

    // Success case - Logs character usage when provided
    it('should log character usage when character is provided', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player1ReportedRaces: [],
      };
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.matchCharacterUsage.create as jest.Mock).mockResolvedValue({ id: 'char1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        character: 'mario',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.matchCharacterUsage.create).toHaveBeenCalledWith({
        data: {
          matchId: 'm1',
          matchType: 'GP',
          playerId: 'p1',
          character: 'mario',
        },
      });
    });

    // Not found case - Returns 404 when match is not found
    it('should return 404 when match is not found', async () => {
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(null);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/nonexistent/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'nonexistent' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Match not found' });
      expect(result.status).toBe(404);
    });

    // Validation error case - Returns 400 when character is invalid
    it('should return 400 when character is invalid', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
      };
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        character: 'invalid_character',
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Invalid character' });
      expect(result.status).toBe(400);
    });

    // Validation error case - Returns 400 when match is already completed
    it('should return 400 when match is already completed', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: true,
      };
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock).mockResolvedValue(mockMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Match already completed' });
      expect(result.status).toBe(400);
    });

    // Rate limit case - Returns 429 when rate limit is exceeded
    it('should return 429 when rate limit is exceeded', async () => {
      (rateLimit as jest.Mock).mockResolvedValue({ success: false });
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Too many requests. Please try again later.' });
      expect(result.status).toBe(429);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.data).toEqual({ error: 'Failed to report score' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to report score', { error: expect.any(Error), tournamentId: 't1', matchId: 'm1' });
    });

    // Edge case - Continues when score entry log creation fails
    it('should continue when score entry log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player1ReportedRaces: [],
      };
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockRejectedValue(new Error('Log failed'));
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create score entry log', expect.any(Object));
    });

    // Edge case - Continues when character usage log creation fails
    it('should continue when character usage log creation fails', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 18,
        player1ReportedPoints2: 6,
        player1ReportedRaces: [],
      };
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.matchCharacterUsage.create as jest.Mock).mockRejectedValue(new Error('Char log failed'));
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        character: 'mario',
        races: [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
        ],
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create character usage log', expect.any(Object));
    });

    // Edge case - Calculates correct driver points
    it('should calculate correct driver points for positions', async () => {
      const mockMatch = {
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        completed: false,
        player1ReportedPoints1: null,
        player1ReportedPoints2: null,
        player2ReportedPoints1: null,
        player2ReportedPoints2: null,
      };
      
      const updatedMatch = {
        ...mockMatch,
        player1ReportedPoints1: 21,
        player1ReportedPoints2: 12,
        player1ReportedRaces: [],
      };
      
      const races = [
        { course: 'Mario Circuit 1', position1: 1, position2: 2 },
        { course: 'Donut Plains 1', position1: 1, position2: 3 },
        { course: 'Ghost Valley 1', position1: 2, position2: 1 },
        { course: 'Bowser Castle 1', position1: 2, position2: 4 },
      ];
      
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });
      (prisma.gPMatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMatch)
        .mockResolvedValueOnce(updatedMatch);
      (prisma.scoreEntryLog.create as jest.Mock).mockResolvedValue({ id: 'log1' });
      (prisma.gPMatch.update as jest.Mock).mockResolvedValue(updatedMatch);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);
      
      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/gp/match/m1/report', {
        reportingPlayer: 1,
        races,
      });
      const params = Promise.resolve({ id: 't1', matchId: 'm1' });
      const result = await POST(request, { params });
      
      expect(result.status).toBe(200);
      expect(prisma.scoreEntryLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportedData: expect.objectContaining({
            totalPoints1: 21,
            totalPoints2: 12,
          }),
        }),
      });
    });
  });
});
