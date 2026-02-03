/**
 * @module promotion.test
 *
 * Test suite for TA (Time Attack) promotion functions (`@/lib/ta/promotion`).
 *
 * Covers:
 * Note: promoteToFinals tests were removed because the function was deleted
 * (superseded by Phase 1/2/3 promotion via /api/tournaments/[id]/ta/phases).
 *
 * - promoteToRevival1:
 *   - Promoting qualification ranks 17-24 to revival round 1 with 1 life
 *   - Error on insufficient qualified players
 *   - Skipping null-totalTime players and already-promoted players
 *   - Audit log error resilience
 * - promoteToRevival2:
 *   - Promoting qualification ranks 13-16 + revival round 1 survivors
 *   - Error on no available players
 *   - Skipping null-totalTime players and already-promoted players
 *   - Audit log error resilience
 */
jest.mock('@/lib/audit-log', () => ({
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
  },
  createAuditLog: jest.fn(),
}));

jest.mock('@prisma/client', () => {
  const originalModule = jest.requireActual('@prisma/client');
  return {
    ...originalModule,
    PrismaClient: jest.fn().mockImplementation(() => ({
      tTEntry: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    })),
  };
});

import { promoteToRevival1, promoteToRevival2, PromotionContext } from '@/lib/ta/promotion';
import { PrismaClient } from '@prisma/client';
import { createAuditLog } from '@/lib/audit-log';

type TTEntry = {
  id: string;
  tournamentId: string;
  playerId: string;
  stage: 'qualification' | 'revival_1' | 'revival_2';
  rank: number | null;
  totalTime: number | null;
  lives: number;
  eliminated: boolean;
  times: Record<string, string> | null;
  player: {
    id: string;
    nickname: string;
  };
};

describe('TA Promotion Functions', () => {
  let mockPrisma: PrismaClient;
  let mockContext: PromotionContext;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockContext = {
      tournamentId: 'tournament-1',
      userId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    };
    jest.clearAllMocks();
  });

  describe('promoteToRevival1', () => {
    const mockQualifiers: TTEntry[] = [
      {
        id: 'entry-17',
        tournamentId: 'tournament-1',
        playerId: 'player-17',
        stage: 'qualification',
        rank: 17,
        totalTime: 170000,
        lives: 3,
        eliminated: false,
        times: {},
        player: { id: 'player-17', nickname: 'Player17' },
      },
      {
        id: 'entry-18',
        tournamentId: 'tournament-1',
        playerId: 'player-18',
        stage: 'qualification',
        rank: 18,
        totalTime: 180000,
        lives: 3,
        eliminated: false,
        times: {},
        player: { id: 'player-18', nickname: 'Player18' },
      },
      {
        id: 'entry-19',
        tournamentId: 'tournament-1',
        playerId: 'player-19',
        stage: 'qualification',
        rank: 19,
        totalTime: null,
        lives: 3,
        eliminated: false,
        times: {},
        player: { id: 'player-19', nickname: 'Player19' },
      },
    ];

    it('should promote players 17-24 to revival round 1', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockQualifiers);
      (mockPrisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      const createdRevival: TTEntry[] = [
        {
          id: 'revival-1-17',
          tournamentId: 'tournament-1',
          playerId: 'player-17',
          stage: 'revival_1',
          rank: 17,
          totalTime: 170000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-17', nickname: 'Player17' },
        },
        {
          id: 'revival-1-18',
          tournamentId: 'tournament-1',
          playerId: 'player-18',
          stage: 'revival_1',
          rank: 18,
          totalTime: 180000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-18', nickname: 'Player18' },
        },
      ];

      (mockPrisma.tTEntry.create as jest.Mock)
        .mockResolvedValueOnce(createdRevival[0])
        .mockResolvedValueOnce(createdRevival[1]);

      const result = await promoteToRevival1(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].playerId).toBe('player-17');
      expect(result.entries[1].playerId).toBe('player-18');
      expect(result.entries[0].lives).toBe(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe('Player19');
      expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-1', stage: 'qualification' },
        include: { player: true },
        orderBy: [{ rank: 'asc' }, { totalTime: 'asc' }],
        skip: 16,
        take: 8,
      });
      expect(createAuditLog).toHaveBeenCalledTimes(2);
    });

    it('should throw error when not enough qualified players', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock).mockResolvedValue([]);

      await expect(promoteToRevival1(mockPrisma, mockContext)).rejects.toThrow(
        'Not enough qualified players for revival round 1'
      );
    });

    it('should skip players with null totalTime', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockQualifiers);
      (mockPrisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      const createdRevival: TTEntry[] = [
        {
          id: 'revival-1-17',
          tournamentId: 'tournament-1',
          playerId: 'player-17',
          stage: 'revival_1',
          rank: 17,
          totalTime: 170000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-17', nickname: 'Player17' },
        },
        {
          id: 'revival-1-18',
          tournamentId: 'tournament-1',
          playerId: 'player-18',
          stage: 'revival_1',
          rank: 18,
          totalTime: 180000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-18', nickname: 'Player18' },
        },
      ];

      (mockPrisma.tTEntry.create as jest.Mock)
        .mockResolvedValueOnce(createdRevival[0])
        .mockResolvedValueOnce(createdRevival[1]);

      const result = await promoteToRevival1(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(2);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe('Player19');
    });

    it('should skip players already in revival round 1', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock).mockResolvedValue(mockQualifiers);
      (mockPrisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing-revival', playerId: 'player-17' })
        .mockResolvedValueOnce(null);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      const createdRevival: TTEntry = {
        id: 'revival-1-18',
        tournamentId: 'tournament-1',
        playerId: 'player-18',
        stage: 'revival_1',
        rank: 18,
        totalTime: 180000,
        lives: 1,
        eliminated: false,
        times: {},
        player: { id: 'player-18', nickname: 'Player18' },
      };

      (mockPrisma.tTEntry.create as jest.Mock).mockResolvedValue(createdRevival);

      const result = await promoteToRevival1(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].playerId).toBe('player-18');
      expect(createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should handle audit log creation errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (mockPrisma.tTEntry.findMany as jest.Mock).mockResolvedValue([mockQualifiers[0]]);
      (mockPrisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

      const createdRevival: TTEntry = {
        id: 'revival-1-17',
        tournamentId: 'tournament-1',
        playerId: 'player-17',
        stage: 'revival_1',
        rank: 17,
        totalTime: 170000,
        lives: 1,
        eliminated: false,
        times: {},
        player: { id: 'player-17', nickname: 'Player17' },
      };

      (mockPrisma.tTEntry.create as jest.Mock).mockResolvedValue(createdRevival);

      const result = await promoteToRevival1(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(1);
            // expect(consoleSpy).toHaveBeenCalledWith('Failed to create audit log:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('promoteToRevival2', () => {
    const mockQualifiers13to16: TTEntry[] = [
      {
        id: 'entry-13',
        tournamentId: 'tournament-1',
        playerId: 'player-13',
        stage: 'qualification',
        rank: 13,
        totalTime: 130000,
        lives: 3,
        eliminated: false,
        times: {},
        player: { id: 'player-13', nickname: 'Player13' },
      },
      {
        id: 'entry-14',
        tournamentId: 'tournament-1',
        playerId: 'player-14',
        stage: 'qualification',
        rank: 14,
        totalTime: null,
        lives: 3,
        eliminated: false,
        times: {},
        player: { id: 'player-14', nickname: 'Player14' },
      },
    ];

    const mockRevival1Survivors: TTEntry[] = [
      {
        id: 'entry-revival-1',
        tournamentId: 'tournament-1',
        playerId: 'player-revival-1',
        stage: 'revival_1',
        rank: 1,
        totalTime: 150000,
        lives: 1,
        eliminated: false,
        times: {},
        player: { id: 'player-revival-1', nickname: 'RevivalPlayer1' },
      },
      {
        id: 'entry-revival-2',
        tournamentId: 'tournament-1',
        playerId: 'player-revival-2',
        stage: 'revival_1',
        rank: 2,
        totalTime: 160000,
        lives: 1,
        eliminated: false,
        times: {},
        player: { id: 'player-revival-2', nickname: 'RevivalPlayer2' },
      },
    ];

    it('should promote players 13-16 and revival 1 survivors to revival round 2', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(mockQualifiers13to16)
        .mockResolvedValueOnce(mockRevival1Survivors);
      (mockPrisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      const createdRevival: TTEntry[] = [
        {
          id: 'revival-2-13',
          tournamentId: 'tournament-1',
          playerId: 'player-13',
          stage: 'revival_2',
          rank: 13,
          totalTime: 130000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-13', nickname: 'Player13' },
        },
        {
          id: 'revival-2-revival-1',
          tournamentId: 'tournament-1',
          playerId: 'player-revival-1',
          stage: 'revival_2',
          rank: 1,
          totalTime: 150000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-revival-1', nickname: 'RevivalPlayer1' },
        },
        {
          id: 'revival-2-revival-2',
          tournamentId: 'tournament-1',
          playerId: 'player-revival-2',
          stage: 'revival_2',
          rank: 2,
          totalTime: 160000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-revival-2', nickname: 'RevivalPlayer2' },
        },
      ];

      (mockPrisma.tTEntry.create as jest.Mock)
        .mockResolvedValueOnce(createdRevival[0])
        .mockResolvedValueOnce(createdRevival[1])
        .mockResolvedValueOnce(createdRevival[2]);

      const result = await promoteToRevival2(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].playerId).toBe('player-13');
      expect(result.entries[1].playerId).toBe('player-revival-1');
      expect(result.entries[2].playerId).toBe('player-revival-2');
      expect(result.entries[0].lives).toBe(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe('Player14');
      expect(createAuditLog).toHaveBeenCalledTimes(3);
    });

    it('should throw error when no players available', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await expect(promoteToRevival2(mockPrisma, mockContext)).rejects.toThrow(
        'No players available for revival round 2'
      );
    });

    it('should skip players with null totalTime', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(mockQualifiers13to16)
        .mockResolvedValueOnce(mockRevival1Survivors);
      (mockPrisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);

      const createdRevival: TTEntry[] = [
        {
          id: 'revival-2-13',
          tournamentId: 'tournament-1',
          playerId: 'player-13',
          stage: 'revival_2',
          rank: 13,
          totalTime: 130000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-13', nickname: 'Player13' },
        },
        {
          id: 'revival-2-revival-1',
          tournamentId: 'tournament-1',
          playerId: 'player-revival-1',
          stage: 'revival_2',
          rank: 1,
          totalTime: 150000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-revival-1', nickname: 'RevivalPlayer1' },
        },
        {
          id: 'revival-2-revival-2',
          tournamentId: 'tournament-1',
          playerId: 'player-revival-2',
          stage: 'revival_2',
          rank: 2,
          totalTime: 160000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-revival-2', nickname: 'RevivalPlayer2' },
        },
      ];

      (mockPrisma.tTEntry.create as jest.Mock)
        .mockResolvedValueOnce(createdRevival[0])
        .mockResolvedValueOnce(createdRevival[1])
        .mockResolvedValueOnce(createdRevival[2]);

      const result = await promoteToRevival2(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(3);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe('Player14');
    });

    it('should skip players already in revival round 2', async () => {
      (mockPrisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(mockQualifiers13to16)
        .mockResolvedValueOnce(mockRevival1Survivors);
      (mockPrisma.tTEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing-revival', playerId: 'player-13' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (createAuditLog as jest.Mock).mockResolvedValue(undefined);

      const createdRevival: TTEntry[] = [
        {
          id: 'revival-2-revival-1',
          tournamentId: 'tournament-1',
          playerId: 'player-revival-1',
          stage: 'revival_2',
          rank: 1,
          totalTime: 150000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-revival-1', nickname: 'RevivalPlayer1' },
        },
        {
          id: 'revival-2-revival-2',
          tournamentId: 'tournament-1',
          playerId: 'player-revival-2',
          stage: 'revival_2',
          rank: 2,
          totalTime: 160000,
          lives: 1,
          eliminated: false,
          times: {},
          player: { id: 'player-revival-2', nickname: 'RevivalPlayer2' },
        },
      ];

      (mockPrisma.tTEntry.create as jest.Mock)
        .mockResolvedValueOnce(createdRevival[0])
        .mockResolvedValueOnce(createdRevival[1]);

      const result = await promoteToRevival2(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].playerId).toBe('player-revival-1');
      expect(result.entries[1].playerId).toBe('player-revival-2');
      expect(createAuditLog).toHaveBeenCalledTimes(2);
    });

    it('should handle audit log creation errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (mockPrisma.tTEntry.findMany as jest.Mock)
        .mockResolvedValueOnce(mockQualifiers13to16)
        .mockResolvedValueOnce([]);
      (mockPrisma.tTEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

      const createdRevival: TTEntry = {
        id: 'revival-2-13',
        tournamentId: 'tournament-1',
        playerId: 'player-13',
        stage: 'revival_2',
        rank: 13,
        totalTime: 130000,
        lives: 1,
        eliminated: false,
        times: {},
        player: { id: 'player-13', nickname: 'Player13' },
      };

      (mockPrisma.tTEntry.create as jest.Mock).mockResolvedValue(createdRevival);

      const result = await promoteToRevival2(mockPrisma, mockContext);

      expect(result.entries).toHaveLength(1);
            // expect(consoleSpy).toHaveBeenCalledWith('Failed to create audit log:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
