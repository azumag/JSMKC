// @ts-nocheck - This test file uses complex mock types for Next.js API routes
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  default: {
    tTEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('@/lib/rate-limit', () => ({
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'test-agent'),
  rateLimit: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data) => data),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
    UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
    DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',
  },
}));

jest.mock('@/lib/ta/rank-calculation', () => ({
  recalculateRanks: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/ta/promotion', () => ({
  promoteToFinals: jest.fn(),
  promoteToRevival1: jest.fn(),
  promoteToRevival2: jest.fn(),
}));

jest.mock('@/lib/constants', () => ({
  COURSES: ['MC1', 'MC2', 'MC3'],
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn();
  return {
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { getClientIdentifier, getUserAgent, rateLimit } from '@/lib/rate-limit';

// Type assertion for audit log
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;
import { sanitizeInput } from '@/lib/sanitize';
import { recalculateRanks } from '@/lib/ta/rank-calculation';
import * as taRoute from '@/app/api/tournaments/[id]/ta/route';

const logger = createLogger('ta-route-test');

// Type assertions for logger methods to make Jest happy
const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;
const mockLoggerWarn = logger.warn as jest.MockedFunction<typeof logger.warn>;

describe('GET /api/tournaments/[id]/ta', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should return TA entries for qualification stage', async () => {
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          playerId: 'p1',
          stage: 'qualification',
          rank: 1,
          totalTime: 83456,
          lives: 1,
          times: { MC1: '1:23.456', MC2: '1:30.123' },
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'p1',
          },
        },
      ];

      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTEntry.count as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'qualification' },
        include: { player: true },
        orderBy: [{ rank: 'asc' }, { totalTime: 'asc' }],
      });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: mockEntries,
          courses: ['MC1', 'MC2', 'MC3'],
          stage: 'qualification',
          qualCount: 10,
          finalsCount: 5,
        })
      );
    });

    it('should return TA entries for finals stage when stage param provided', async () => {
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          playerId: 'p1',
          stage: 'finals',
          rank: 1,
          totalTime: 80000,
          lives: 2,
          times: { MC1: '1:20.000' },
          player: {
            id: 'p1',
            name: 'Player 1',
            nickname: 'p1',
          },
        },
      ];

      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);
      (prisma.tTEntry.count as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5);

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta?stage=finals'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 't1', stage: 'finals' },
        include: { player: true },
        orderBy: [{ rank: 'asc' }, { totalTime: 'asc' }],
      });

      const responseCall = (NextResponse.json as jest.Mock).mock.calls.find(
        (call) => call[0]?.entries !== undefined
      );
      expect(responseCall[0].stage).toBe('finals');
    });

    it('should return empty entries array when no entries exist', async () => {
      (prisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.tTEntry.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [],
          courses: ['MC1', 'MC2', 'MC3'],
          stage: 'qualification',
          qualCount: 0,
          finalsCount: 0,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to fetch TA data',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to fetch time attack data',
        }),
        { status: 500 }
      );
    });

    it('should include tournamentId in error logging', async () => {
      (prisma.tTEntry.findMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await taRoute.GET(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta'),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to fetch TA data',
        expect.objectContaining({
          tournamentId: 't1',
          error: expect.any(Error),
        })
      );
    });
  });
});

describe('POST /api/tournaments/[id]/ta', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Add Players to TA', () => {
    it('should add player to TA successfully', async () => {
      const mockEntry = {
        id: 'entry1',
        tournamentId: 't1',
        playerId: 'p1',
        stage: 'qualification',
        rank: 0,
        totalTime: 0,
        lives: 1,
        times: {},
        player: {
          id: 'p1',
          name: 'Player 1',
          nickname: 'p1',
        },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        playerId: 'p1',
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.create as jest.Mock).mockResolvedValue(mockEntry);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'POST',
          headers: { 'user-agent': 'test-agent' },
          body: JSON.stringify({ playerId: 'p1' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findUnique).toHaveBeenCalledWith({
        where: {
          tournamentId_playerId_stage: {
            tournamentId: 't1',
            playerId: 'p1',
            stage: 'qualification',
          },
        },
      });

      expect(prisma.tTEntry.create).toHaveBeenCalledWith({
        data: {
          tournamentId: 't1',
          playerId: 'p1',
          stage: 'qualification',
          times: {},
        },
        include: { player: true },
      });

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: 'entry1',
          targetType: 'TTEntry',
          details: expect.objectContaining({
            tournamentId: 't1',
            playerId: 'p1',
            playerNickname: 'p1',
          }),
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Player(s) added to time attack',
          entries: [mockEntry],
        }),
        { status: 201 }
      );
    });

    it('should add multiple players to TA successfully', async () => {
      const mockEntries = [
        {
          id: 'entry1',
          tournamentId: 't1',
          playerId: 'p1',
          stage: 'qualification',
          rank: 0,
          totalTime: 0,
          lives: 1,
          times: {},
          player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
        },
        {
          id: 'entry2',
          tournamentId: 't1',
          playerId: 'p2',
          stage: 'qualification',
          rank: 0,
          totalTime: 0,
          lives: 1,
          times: {},
          player: { id: 'p2', name: 'Player 2', nickname: 'p2' },
        },
      ];

      (sanitizeInput as jest.Mock).mockReturnValue({
        players: ['p1', 'p2'],
      });
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (prisma.tTEntry.create as jest.Mock)
        .mockResolvedValueOnce(mockEntries[0])
        .mockResolvedValueOnce(mockEntries[1]);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'POST',
          body: JSON.stringify({ players: ['p1', 'p2'] }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.create).toHaveBeenCalledTimes(2);
      expect(createAuditLog).toHaveBeenCalledTimes(2);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Player(s) added to time attack',
          entries: mockEntries,
        }),
        { status: 201 }
      );
    });

    it('should not create entry if player already exists in TA', async () => {
      const existingEntry = {
        id: 'entry1',
        tournamentId: 't1',
        playerId: 'p1',
        stage: 'qualification',
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        playerId: 'p1',
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(existingEntry);
      (prisma.tTEntry.create as jest.Mock).mockResolvedValue(existingEntry);

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'POST',
          body: JSON.stringify({ playerId: 'p1' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.create).not.toHaveBeenCalled();

      const responseCall = (NextResponse.json as jest.Mock).mock.calls.find(
        (call) => call[0]?.entries !== undefined
      );
      expect(responseCall[0].entries).toHaveLength(0);
    });
  });

  describe('Promotion Actions', () => {
    it('should promote players to finals', async () => {
      const mockResult = {
        entries: [
          {
            id: 'entry1',
            playerId: 'p1',
            stage: 'finals',
          },
        ],
        skipped: [],
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        action: 'promote_to_finals',
        topN: 8,
      });
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      jest.requireMock('@/lib/ta/promotion').promoteToFinals.mockResolvedValue(mockResult);
      (rateLimit as jest.Mock).mockResolvedValue({ success: true });

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'POST',
          body: JSON.stringify({ action: 'promote_to_finals', topN: 8 }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      const promoteToFinals = jest.requireMock('@/lib/ta/promotion').promoteToFinals;
      expect(promoteToFinals).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          tournamentId: 't1',
          userId: 'admin-1',
        })
      );

      expect(recalculateRanks).toHaveBeenCalledWith('t1', 'finals', prisma);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Players promoted to finals',
          entries: mockResult.entries,
          skipped: mockResult.skipped,
        }),
        { status: 201 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle audit log failures gracefully', async () => {
      const mockEntry = {
        id: 'entry1',
        tournamentId: 't1',
        playerId: 'p1',
        player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({ playerId: 'p1' });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.tTEntry.create as jest.Mock).mockResolvedValue(mockEntry);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log error'));

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'POST',
          body: JSON.stringify({ playerId: 'p1' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Should still return success even if audit log fails
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Player(s) added to time attack',
          entries: [mockEntry],
        }),
        { status: 201 }
      );
    });

    it('should handle database errors gracefully', async () => {
      (sanitizeInput as jest.Mock).mockReturnValue({ playerId: 'p1' });
      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await taRoute.POST(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'POST',
          body: JSON.stringify({ playerId: 'p1' }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to add player to TA',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        }),
        { status: 500 }
      );
    });
  });
});

describe('PUT /api/tournaments/[id]/ta', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Update Entry Times', () => {
    it('should update entry times successfully', async () => {
      const mockEntry = {
        id: 'entry1',
        tournamentId: 't1',
        playerId: 'p1',
        stage: 'qualification',
        times: { MC1: '1:23.456', MC2: '1:30.123' },
        totalTime: 93579,
        rank: 1,
        player: {
          id: 'p1',
          name: 'Player 1',
          nickname: 'p1',
        },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'update_times',
        times: { MC1: '1:23.456', MC2: '1:30.123' },
      });
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockEntry)
        .mockResolvedValueOnce(mockEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue(undefined);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'update_times',
            times: { MC1: '1:23.456', MC2: '1:30.123' },
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry1' },
        data: { times: { MC1: '1:23.456', MC2: '1:30.123' } },
      });

      expect(recalculateRanks).toHaveBeenCalledWith('t1', 'qualification', prisma);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
          targetId: 'entry1',
          targetType: 'TTEntry',
          details: expect.objectContaining({
            tournamentId: 't1',
            updatedTimes: expect.any(Object),
          }),
        })
      );
    });

    it('should handle single course time update', async () => {
      const mockEntry = {
        id: 'entry1',
        times: { MC1: '1:20.000', MC2: '' },
        player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'update_times',
        course: 'MC1',
        time: '1:20.000',
      });
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockEntry)
        .mockResolvedValueOnce(mockEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue(undefined);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'update_times',
            course: 'MC1',
            time: '1:20.000',
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            times: expect.objectContaining({ MC1: '1:20.000' }),
          }),
        })
      );
    });

    it('should return 404 when entry not found', async () => {
      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'update_times',
        times: { MC1: '1:23.456' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'update_times',
            times: { MC1: '1:23.456' },
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Entry not found',
        }),
        { status: 404 }
      );
    });

    it('should return 400 for invalid course', async () => {
      const mockEntry = {
        id: 'entry1',
        times: {},
        player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'update_times',
        course: 'INVALID',
        time: '1:20.000',
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'update_times',
            course: 'INVALID',
            time: '1:20.000',
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid course abbreviation',
        }),
        { status: 400 }
      );
    });
  });

  describe('Eliminate Player', () => {
    it('should eliminate player successfully', async () => {
      const mockEntry = {
        id: 'entry1',
        tournamentId: 't1',
        playerId: 'p1',
        stage: 'qualification',
        eliminated: false,
        player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'eliminate',
        eliminated: true,
      });
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue({
        ...mockEntry,
        eliminated: true,
      });
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'eliminate',
            eliminated: true,
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry1' },
        data: { eliminated: true },
        include: { player: true },
      });

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
          targetId: 'entry1',
          targetType: 'TTEntry',
          details: expect.objectContaining({
            eliminated: true,
            manualUpdate: true,
          }),
        })
      );
    });

    it('should require authentication for eliminate action', async () => {
      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'eliminate',
        eliminated: true,
      });
      (auth as jest.Mock).mockResolvedValue(null);

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'eliminate',
            eliminated: true,
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required for delete operations',
        }),
        { status: 401 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle audit log failures gracefully', async () => {
      const mockEntry = {
        id: 'entry1',
        times: { MC1: '1:20.000' },
        player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
      };

      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'update_times',
        times: { MC1: '1:20.000' },
      });
      (prisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockEntry)
        .mockResolvedValueOnce(mockEntry);
      (prisma.tTEntry.update as jest.Mock).mockResolvedValue(undefined);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log error'));

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'update_times',
            times: { MC1: '1:20.000' },
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Should still complete the update even if audit log fails
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          entry: expect.any(Object),
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      (sanitizeInput as jest.Mock).mockReturnValue({
        entryId: 'entry1',
        action: 'update_times',
        times: { MC1: '1:20.000' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await taRoute.PUT(
        new NextRequest('http://localhost:3000/api/tournaments/t1/ta', {
          method: 'PUT',
          body: JSON.stringify({
            entryId: 'entry1',
            action: 'update_times',
            times: { MC1: '1:20.000' },
          }),
        }),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to update times',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to update times',
        }),
        { status: 500 }
      );
    });
  });
});

describe('DELETE /api/tournaments/[id]/ta', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 401 when not authenticated', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const url = new URL('http://localhost:3000/api/tournaments/t1/ta?entryId=entry1');
      await taRoute.DELETE(
        new NextRequest(url.toString()),
        { params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
        }),
        { status: 401 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should delete entry successfully', async () => {
      const mockEntry = {
        id: 'entry1',
        tournamentId: 't1',
        playerId: 'p1',
        stage: 'qualification',
        player: {
          id: 'p1',
          name: 'Player 1',
          nickname: 'p1',
        },
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);
      (prisma.tTEntry.delete as jest.Mock).mockResolvedValue(undefined);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      const url = new URL('http://localhost:3000/api/tournaments/t1/ta?entryId=entry1');
      await taRoute.DELETE(new NextRequest(url.toString()), {
        params: Promise.resolve({ id: 't1' }) }
      );

      expect(prisma.tTEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'entry1' },
        include: { player: true },
      });

      expect(prisma.tTEntry.delete).toHaveBeenCalledWith({
        where: { id: 'entry1' },
      });

      expect(recalculateRanks).toHaveBeenCalledWith('t1', 'qualification', prisma);

      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: AUDIT_ACTIONS.DELETE_TA_ENTRY,
          targetId: 'entry1',
          targetType: 'TTEntry',
          details: expect.objectContaining({
            tournamentId: 't1',
            playerNickname: 'p1',
            deletedBy: 'admin-1@example.com',
            softDeleted: true,
          }),
        })
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Entry deleted successfully',
          softDeleted: true,
        }),
        { status: 200 }
      );
    });

    it('should return 400 when entryId is missing', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });

      const url = new URL('http://localhost:3000/api/tournaments/t1/ta');
      await taRoute.DELETE(new NextRequest(url.toString()), {
        params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'entryId is required',
        }),
        { status: 400 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should return 404 when entry not found', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      const url = new URL('http://localhost:3000/api/tournaments/t1/ta?entryId=entry1');
      await taRoute.DELETE(new NextRequest(url.toString()), {
        params: Promise.resolve({ id: 't1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Entry not found',
        }),
        { status: 404 }
      );
    });

    it('should handle audit log failures gracefully', async () => {
      const mockEntry = {
        id: 'entry1',
        player: { id: 'p1', name: 'Player 1', nickname: 'p1' },
      };

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(mockEntry);
      (prisma.tTEntry.delete as jest.Mock).mockResolvedValue(undefined);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log error'));

      const url = new URL('http://localhost:3000/api/tournaments/t1/ta?entryId=entry1');
      await taRoute.DELETE(new NextRequest(url.toString()), {
        params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Failed to create audit log',
        expect.any(Object)
      );

      // Should still return success even if audit log fails
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Entry deleted successfully',
          softDeleted: true,
        }),
        { status: 200 }
      );
    });

    it('should handle database errors gracefully', async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'admin-1', role: 'admin' },
      });
      (prisma.tTEntry.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const url = new URL('http://localhost:3000/api/tournaments/t1/ta?entryId=entry1');
      await taRoute.DELETE(new NextRequest(url.toString()), {
        params: Promise.resolve({ id: 't1' }) }
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to delete entry',
        expect.any(Object)
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to delete entry',
        }),
        { status: 500 }
      );
    });
  });
});
