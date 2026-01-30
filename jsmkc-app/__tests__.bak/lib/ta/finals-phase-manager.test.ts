/**
 * Unit tests for TA Finals Phase Manager
 *
 * Tests the three phases of TA finals:
 * - Phase 1: Ranks 17-24 from qualification, elimination by slowest
 * - Phase 2: Phase 1 survivors + Ranks 13-16, elimination by slowest
 * - Phase 3: Phase 2 survivors + Ranks 1-12, life-based elimination
 */

import {
  PHASE_CONFIG,
  processEliminationPhaseResult,
  processPhase3Result,
  getPhaseStatus,
} from "@/lib/ta/finals-phase-manager";

// Mock Prisma client
const mockPrismaClient = {
  tTEntry: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((ops) => Promise.all(ops)),
};

// Mock audit log
jest.mock("@/lib/audit-log", () => ({
  createAuditLog: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    CREATE_TA_ENTRY: "CREATE_TA_ENTRY",
    UPDATE_TA_ENTRY: "UPDATE_TA_ENTRY",
  },
}));

// Mock logger
jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

describe("TA Finals Phase Manager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("PHASE_CONFIG", () => {
    it("should have correct Phase 1 configuration", () => {
      expect(PHASE_CONFIG.phase1).toEqual({
        qualRankStart: 17,
        qualRankEnd: 24,
        startingPlayers: 8,
        survivorsNeeded: 4,
        hasLives: false,
      });
    });

    it("should have correct Phase 2 configuration", () => {
      expect(PHASE_CONFIG.phase2).toEqual({
        qualRankStart: 13,
        qualRankEnd: 16,
        startingPlayers: 8,
        survivorsNeeded: 4,
        hasLives: false,
      });
    });

    it("should have correct Phase 3 configuration", () => {
      expect(PHASE_CONFIG.phase3).toEqual({
        qualRankStart: 1,
        qualRankEnd: 12,
        startingPlayers: 16,
        survivorsNeeded: 1,
        hasLives: true,
        initialLives: 3,
        lifeResetThresholds: [8, 4, 2],
      });
    });
  });

  describe("processEliminationPhaseResult", () => {
    const context = {
      tournamentId: "t1",
      userId: "u1",
      ipAddress: "127.0.0.1",
      userAgent: "test",
    };

    it("should eliminate the slowest player", async () => {
      // Mock active players
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: "p1", eliminated: false },
        { playerId: "p2", eliminated: false },
        { playerId: "p3", eliminated: false },
        { playerId: "p4", eliminated: false },
        { playerId: "p5", eliminated: false },
      ]);

      mockPrismaClient.tTEntry.update.mockResolvedValue({});

      const courseResults = [
        { playerId: "p1", timeMs: 80000 },
        { playerId: "p2", timeMs: 85000 },
        { playerId: "p3", timeMs: 90000 },
        { playerId: "p4", timeMs: 95000 },
        { playerId: "p5", timeMs: 100000 }, // Slowest
      ];

      const eliminated = await processEliminationPhaseResult(
        mockPrismaClient as any,
        context,
        "phase1",
        courseResults
      );

      expect(eliminated).toEqual(["p5"]);
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { eliminated: true },
        })
      );
    });

    it("should not eliminate when at survivor count", async () => {
      // Already at 4 survivors
      mockPrismaClient.tTEntry.findMany.mockResolvedValue([
        { playerId: "p1", eliminated: false },
        { playerId: "p2", eliminated: false },
        { playerId: "p3", eliminated: false },
        { playerId: "p4", eliminated: false },
      ]);

      const courseResults = [
        { playerId: "p1", timeMs: 80000 },
        { playerId: "p2", timeMs: 85000 },
        { playerId: "p3", timeMs: 90000 },
        { playerId: "p4", timeMs: 95000 },
      ];

      const eliminated = await processEliminationPhaseResult(
        mockPrismaClient as any,
        context,
        "phase1",
        courseResults
      );

      expect(eliminated).toEqual([]);
      expect(mockPrismaClient.tTEntry.update).not.toHaveBeenCalled();
    });
  });

  describe("processPhase3Result", () => {
    const context = {
      tournamentId: "t1",
      userId: "u1",
      ipAddress: "127.0.0.1",
      userAgent: "test",
    };

    it("should deduct life from bottom half players", async () => {
      const activeEntries = [
        { id: "e1", playerId: "p1", eliminated: false, lives: 3 },
        { id: "e2", playerId: "p2", eliminated: false, lives: 3 },
        { id: "e3", playerId: "p3", eliminated: false, lives: 3 },
        { id: "e4", playerId: "p4", eliminated: false, lives: 3 },
        { id: "e5", playerId: "p5", eliminated: false, lives: 3 },
        { id: "e6", playerId: "p6", eliminated: false, lives: 3 },
        { id: "e7", playerId: "p7", eliminated: false, lives: 3 },
        { id: "e8", playerId: "p8", eliminated: false, lives: 3 },
      ];

      // First call returns active players, second call returns remaining after update
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(activeEntries)
        .mockResolvedValueOnce(activeEntries.slice(0, 4)); // 4 remaining after life deduction

      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const entry = activeEntries.find(
          (e: any) => e.playerId === where.tournamentId_playerId_stage.playerId
        );
        return Promise.resolve(entry);
      });

      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({});

      const courseResults = [
        { playerId: "p1", timeMs: 80000 }, // Top half
        { playerId: "p2", timeMs: 81000 },
        { playerId: "p3", timeMs: 82000 },
        { playerId: "p4", timeMs: 83000 },
        { playerId: "p5", timeMs: 84000 }, // Bottom half starts here
        { playerId: "p6", timeMs: 85000 },
        { playerId: "p7", timeMs: 86000 },
        { playerId: "p8", timeMs: 87000 },
      ];

      const result = await processPhase3Result(
        mockPrismaClient as any,
        context,
        courseResults
      );

      // Bottom 4 should lose a life (p5, p6, p7, p8)
      expect(mockPrismaClient.tTEntry.update).toHaveBeenCalledTimes(4);
    });

    it("should eliminate players with 0 lives", async () => {
      const activeEntries = [
        { id: "e1", playerId: "p1", eliminated: false, lives: 3 },
        { id: "e2", playerId: "p2", eliminated: false, lives: 1 }, // Will be eliminated
      ];

      // First call returns active players, second call returns single remaining player
      mockPrismaClient.tTEntry.findMany
        .mockResolvedValueOnce(activeEntries)
        .mockResolvedValueOnce([activeEntries[0]]); // Only p1 remains

      mockPrismaClient.tTEntry.findUnique.mockImplementation(({ where }) => {
        const entry = activeEntries.find(
          (e: any) => e.playerId === where.tournamentId_playerId_stage.playerId
        );
        return Promise.resolve(entry);
      });

      mockPrismaClient.tTEntry.update.mockResolvedValue({});
      mockPrismaClient.tTEntry.updateMany.mockResolvedValue({});

      const courseResults = [
        { playerId: "p1", timeMs: 80000 },
        { playerId: "p2", timeMs: 90000 }, // Slower, will lose life
      ];

      const result = await processPhase3Result(
        mockPrismaClient as any,
        context,
        courseResults
      );

      expect(result.eliminated).toContain("p2");
    });
  });

  describe("getPhaseStatus", () => {
    it("should return current phase status", async () => {
      mockPrismaClient.tTEntry.findMany.mockImplementation(({ where }) => {
        if (where.stage === "phase1") {
          return Promise.resolve([
            { playerId: "p1", eliminated: false, player: { nickname: "Player1" } },
            { playerId: "p2", eliminated: true, player: { nickname: "Player2" } },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getPhaseStatus(mockPrismaClient as any, "t1");

      expect(status.phase1).toEqual({
        total: 2,
        active: 1,
        eliminated: 1,
      });
      expect(status.currentPhase).toBe("phase1");
    });

    it("should identify winner in phase3", async () => {
      mockPrismaClient.tTEntry.findMany.mockImplementation(({ where }) => {
        if (where.stage === "phase3") {
          return Promise.resolve([
            { playerId: "p1", eliminated: false, player: { nickname: "Winner" } },
            { playerId: "p2", eliminated: true, player: { nickname: "Loser" } },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getPhaseStatus(mockPrismaClient as any, "t1");

      expect(status.phase3).toEqual({
        total: 2,
        active: 1,
        eliminated: 1,
        winner: "Winner",
      });
    });
  });
});
