// @ts-nocheck


jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/audit-log', () => ({ createAuditLog: jest.fn(), AUDIT_ACTIONS: { CREATE_MR_MATCH: 'CREATE_MR_MATCH' } }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((data) => data) }));
jest.mock('@/lib/logger', () => ({ createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn() })) }));
jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { createAuditLog } from '@/lib/audit-log';
import { POST } from '@/app/api/tournaments/[id]/mr/finals/matches/route';

const sanitizeMock = jest.requireMock('@/lib/sanitize') as { sanitizeInput: jest.Mock };
const auditLogMock = jest.requireMock('@/lib/audit-log') as { createAuditLog: jest.Mock };
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

describe('MR Finals Matches API Route - /api/tournaments/[id]/mr/finals/matches', () => {
  const loggerMock = { error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(loggerMock);
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockImplementation((data: any, options?: any) => ({ data, status: options?.status || 200 }));
    sanitizeMock.sanitizeInput.mockImplementation((data) => data);
  });

  describe('POST - Create finals match', () => {
    // Success case - Creates match with valid data
    it('should create a finals match with valid data', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'finals',
        round: 'qf1',
        player1: mockPlayer1,
        player2: mockPlayer2,
      };

      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
        player1Side: 1,
        player2Side: 2,
        tvNumber: 1,
        bracket: 'winners',
        bracketPosition: 'qf1',
        isGrandFinal: false,
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({
        message: 'Match created successfully',
        match: mockMatch,
      });
      expect(result.status).toBe(201);
      expect(prisma.mRMatch.create).toHaveBeenCalledWith({
        data: {
          tournamentId: 't1',
          matchNumber: 1,
          stage: 'finals',
          round: 'qf1',
          tvNumber: 1,
          player1Id: 'p1',
          player2Id: 'p2',
          player1Side: 1,
          player2Side: 2,
          score1: 0,
          score2: 0,
          completed: false,
          bracket: 'winners',
          bracketPosition: 'qf1',
          losses: 0,
          isGrandFinal: false,
          rounds: {},
        },
        include: { player1: true, player2: true },
      });
    });

    // Success case - Uses default values for optional fields
    it('should create match with default values for optional fields', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'finals',
        player1: mockPlayer1,
        player2: mockPlayer2,
      };

      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      expect(prisma.mRMatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            player1Side: 1,
            player2Side: 2,
            bracket: 'winners',
            isGrandFinal: false,
          }),
        })
      );
    });

    // Success case - Increments match number correctly
    it('should increment match number correctly', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockLastMatch = { matchNumber: 5 };
      const mockMatch = {
        id: 'm6',
        matchNumber: 6,
        stage: 'finals',
        player1: mockPlayer1,
        player2: mockPlayer2,
      };

      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(mockLastMatch);
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      await POST(request, { params });

      expect(prisma.mRMatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            matchNumber: 6,
          }),
        })
      );
    });

    // Authentication failure case - Returns 401 when user is not authenticated
    it('should return 401 when user is not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when user has no user object
    it('should return 401 when session exists but user is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: null });

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Authentication failure case - Returns 401 when user is not admin
    it('should return 401 when user role is not admin', async () => {
      const mockAuth = { user: { id: 'player1', role: 'player' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Unauthorized: Admin access required' });
      expect(result.status).toBe(401);
    });

    // Validation error case - Returns 404 when player1 not found
    it('should return 404 when player1 does not exist', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.player.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'nonexistent',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'One or both players not found' });
      expect(result.status).toBe(404);
    });

    // Validation error case - Returns 404 when player2 not found
    it('should return 404 when player2 does not exist', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(null);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'nonexistent',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'One or both players not found' });
      expect(result.status).toBe(404);
    });

    // Validation error case - Returns 400 for invalid request body
    it('should return 400 for invalid request body', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'invalid-uuid',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(400);
    });

    // Error case - Returns 500 when database operation fails
    it('should return 500 when database operation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.data).toEqual({ error: 'Failed to create match' });
      expect(result.status).toBe(500);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to create match', { error: expect.any(Error), tournamentId: 't1' });
    });

    // Edge case - Creates grand final match
    it('should create grand final match with isGrandFinal=true', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'finals',
        player1: mockPlayer1,
        player2: mockPlayer2,
      };

      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockResolvedValue({});

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
        bracket: 'grand_final',
        isGrandFinal: true,
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      expect(prisma.mRMatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bracket: 'grand_final',
            isGrandFinal: true,
          }),
        })
      );
    });

    // Edge case - Audit log failure is non-critical
    it('should continue when audit log creation fails', async () => {
      const mockAuth = { user: { id: 'admin1', role: 'admin' } };
      (auth as jest.Mock).mockResolvedValue(mockAuth);

      const mockPlayer1 = { id: 'p1', name: 'Player 1', nickname: 'P1' };
      const mockPlayer2 = { id: 'p2', name: 'Player 2', nickname: 'P2' };
      const mockMatch = {
        id: 'm1',
        matchNumber: 1,
        stage: 'finals',
        player1: mockPlayer1,
        player2: mockPlayer2,
      };

      (prisma.player.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockPlayer1)
        .mockResolvedValueOnce(mockPlayer2);
      (prisma.mRMatch.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.mRMatch.create as jest.Mock).mockResolvedValue(mockMatch);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

      const request = new MockNextRequest('http://localhost:3000/api/tournaments/t1/mr/finals/matches', {
        player1Id: 'p1',
        player2Id: 'p2',
      });
      const params = Promise.resolve({ id: 't1' });
      const result = await POST(request, { params });

      expect(result.status).toBe(201);
      expect(loggerMock.warn).toHaveBeenCalledWith('Failed to create audit log', expect.any(Object));
    });
  });
});
