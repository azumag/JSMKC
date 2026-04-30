/**
 * @module rank-calculation.test
 *
 * Test suite for TA (Time Attack) rank calculation functions (`@/lib/ta/rank-calculation`).
 *
 * Covers:
 * - calculateEntryTotal: computing total time from all 20 course time strings,
 *   handling incomplete times (returns null), and null times object
 * - sortByStage:
 *   - Qualification stage: sorts by qualificationPoints descending, totalTime ascending
 *     as tiebreaker; includes all entries (even those with 0 points)
 *   - Finals stage: sorts active (non-eliminated) players by lives then time,
 *     pushes eliminated players to the end; handles both-eliminated, null totalTime
 *   - Revival stage: sorts by total time ascending, excludes null-time entries
 * - assignRanks: assigns sequential 1-based ranks to sorted entries, handles empty input
 * - recalculateRanks: end-to-end recalculation using Prisma mocks, verifying findMany
 *   query parameters, $transaction usage, and handling of incomplete times
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import {
  calculateEntryTotal,
  sortByStage,
  assignRanks,
  recalculateRanks,
  rerankStageAfterDelete,
} from '@/lib/ta/rank-calculation';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { PrismaClient } from '@prisma/client';

jest.mock('@/lib/prisma');

describe('TA Rank Calculation', () => {
  describe('calculateEntryTotal', () => {
    it('should calculate total time for entry with all course times', () => {
      const entry = {
        id: '1',
        times: {
          MC1: '1:23.456',
          DP1: '1:12.345',
          GV1: '0:59.789',
          BC1: '2:34.567',
          MC2: '1:00.000',
          DP2: '1:00.000',
          GV2: '1:00.000',
          BC2: '1:00.000',
          MC3: '1:00.000',
          DP3: '1:00.000',
          GV3: '1:00.000',
          BC3: '1:00.000',
          CI1: '1:00.000',
          CI2: '1:00.000',
          RR: '1:00.000',
          VL1: '1:00.000',
          VL2: '1:00.000',
          KB2: '1:00.000',
          MC4: '1:00.000',
          KB1: '1:00.000',
        },
        lives: 3,
        eliminated: false,
      };

      const result = calculateEntryTotal(entry);
      expect(result.totalTime).toBe(1330157);
      expect(result.lives).toBe(3);
      expect(result.eliminated).toBe(false);
      // New scoring fields should be initialized to defaults
      expect(result.courseScores).toEqual({});
      expect(result.qualificationPoints).toBe(0);
    });

    it('should return null total time when entry has incomplete times', () => {
      const entry = {
        id: '1',
        times: {
          MC1: '1:23.456',
          DP1: '1:12.345',
          GV1: '', // Missing
          BC1: '2:34.567',
        },
        lives: 3,
        eliminated: false,
      };

      const result = calculateEntryTotal(entry);
      expect(result.totalTime).toBeNull();
      expect(result.lives).toBe(3);
      expect(result.eliminated).toBe(false);
    });

    it('should return null total time when times is null', () => {
      const entry = {
        id: '1',
        times: null,
        lives: 3,
        eliminated: false,
      };

      const result = calculateEntryTotal(entry);
      expect(result.totalTime).toBeNull();
      expect(result.lives).toBe(3);
      expect(result.eliminated).toBe(false);
    });

    it('should handle entry with no times object', () => {
      const entry = {
        id: '1',
        times: null,
        lives: 3,
        eliminated: false,
      };

      const result = calculateEntryTotal(entry);
      expect(result.totalTime).toBeNull();
      expect(result.lives).toBe(3);
      expect(result.eliminated).toBe(false);
    });
  });

  describe('sortByStage - qualification', () => {
    it('should sort by qualificationPoints descending, including all entries', () => {
      const entries = [
        {
          id: '1',
          totalTime: 290357,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 100,
        },
        {
          id: '2',
          totalTime: 754567,
          lives: 2,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 200,
        },
        {
          id: '3',
          totalTime: null,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 0,
        },
        {
          id: '4',
          totalTime: 830456,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 150,
        },
      ];

      const sorted = sortByStage(entries, 'qualification');

      // All entries included (not filtered), sorted by points descending
      expect(sorted.length).toBe(4);
      expect(sorted[0].id).toBe('2');   // 200 pts
      expect(sorted[1].id).toBe('4');   // 150 pts
      expect(sorted[2].id).toBe('1');   // 100 pts
      expect(sorted[3].id).toBe('3');   // 0 pts
    });

    it('should use totalTime as tiebreaker when points are equal', () => {
      const entries = [
        {
          id: '1',
          totalTime: 500000,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 100,
        },
        {
          id: '2',
          totalTime: 300000,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 100,
        },
      ];

      const sorted = sortByStage(entries, 'qualification');
      // Same points, faster time wins
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
    });

    it('should sort null totalTime entries to end among same-point entries', () => {
      const entries = [
        {
          id: '1',
          totalTime: null,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 50,
        },
        {
          id: '2',
          totalTime: 300000,
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          courseScores: {},
          qualificationPoints: 50,
        },
      ];

      const sorted = sortByStage(entries, 'qualification');
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
    });
  });

  /* sortByStage finals tests removed: the "finals" sorting branch was deleted
   * from rank-calculation.ts because the legacy promote-to-finals feature was
   * superseded by the Phase 1/2/3 system with its own ranking logic. */

  describe('sortByStage - revival', () => {
    const entries = [
      {
        id: '1',
        totalTime: 290357,
        lives: 3,
        eliminated: false,
        stage: 'revival_1',
        courseScores: {},
        qualificationPoints: 0,
      },
      {
        id: '2',
        totalTime: 754567,
        lives: 2,
        eliminated: false,
        stage: 'revival_1',
        courseScores: {},
        qualificationPoints: 0,
      },
      {
        id: '3',
        totalTime: null,
        lives: 1,
        eliminated: false,
        stage: 'revival_1',
        courseScores: {},
        qualificationPoints: 0,
      },
    ];

    const sorted = sortByStage(entries, 'revival_1');

    expect(sorted.length).toBe(2);
    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
  });

  describe('assignRanks', () => {
    it('should assign sequential ranks to sorted entries', () => {
      const entries = [
        { id: '1', totalTime: 100, lives: 3, eliminated: false, stage: 'qualification', courseScores: {}, qualificationPoints: 0 },
        { id: '2', totalTime: 200, lives: 2, eliminated: false, stage: 'qualification', courseScores: {}, qualificationPoints: 0 },
        { id: '3', totalTime: 300, lives: 1, eliminated: false, stage: 'qualification', courseScores: {}, qualificationPoints: 0 },
      ];

      const rankMap = assignRanks(entries);
      expect(rankMap.get('1')).toBe(1);
      expect(rankMap.get('2')).toBe(2);
      expect(rankMap.get('3')).toBe(3);
      expect(rankMap.size).toBe(3);
    });

    it('should handle empty entries array', () => {
      const rankMap = assignRanks([]);
      expect(rankMap.size).toBe(0);
    });
  });

  describe('recalculateRanks', () => {
    let mockPrisma: Partial<PrismaClient> & {
      tTEntry: { findMany: jest.Mock };
      $executeRaw: jest.Mock;
    };

    beforeEach(() => {
      mockPrisma = {
        tTEntry: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: '1',
              times: { MC1: '1:23.456', DP1: '1:12.345' },
              lives: 3,
              eliminated: false,
              stage: 'qualification',
              player: { id: 'player-1' },
            },
            {
              id: '2',
              times: { MC1: '2:00.000', DP1: '2:00.000' },
              lives: 2,
              eliminated: false,
              stage: 'qualification',
              player: { id: 'player-2' },
            },
          ]),
        },
        // $executeRaw is the bulk-update path (replaces N sequential updates, #710)
        $executeRaw: jest.fn().mockResolvedValue(2),
      };
    });

    it('should recalculate ranks for tournament stage', async () => {
      await recalculateRanks('tournament-1', 'qualification', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-1', stage: 'qualification' },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
      });

      // Bulk UPDATE replaces the old $transaction([...N updates...]) pattern
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should include courseScores and qualificationPoints in bulk UPDATE for qualification', async () => {
      await recalculateRanks('tournament-1', 'qualification', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      // $executeRaw is called as a tagged template literal: first arg is TemplateStringsArray
      const templateStrings = mockPrisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
      const sqlText = templateStrings.raw.join('');
      expect(sqlText).toContain('courseScores');
      expect(sqlText).toContain('qualificationPoints');
    });

    it('should handle entries with incomplete times (totalTime = null in bulk UPDATE)', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([
        {
          id: '1',
          times: { MC1: '1:23.456' }, // Incomplete — only 1 of 20 courses
          lives: 3,
          eliminated: false,
          stage: 'qualification',
          player: { id: 'player-1' },
        },
      ]);

      await recalculateRanks('tournament-1', 'qualification', mockPrisma as unknown as PrismaClient);

      // $executeRaw should still be called once even when totalTime is null
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should omit courseScores / qualificationPoints for non-qualification stages', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([
        {
          id: '1',
          times: { MC1: '1:23.456' },
          lives: 1,
          eliminated: false,
          stage: 'revival_1',
          player: { id: 'player-1' },
        },
      ]);

      await recalculateRanks('tournament-1', 'revival_1', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const templateStrings = mockPrisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
      const sqlText = templateStrings.raw.join('');
      expect(sqlText).not.toContain('courseScores');
      expect(sqlText).not.toContain('qualificationPoints');
    });

    it('should return early without a DB call when there are no entries', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([]);

      await recalculateRanks('tournament-1', 'qualification', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should update large qualification stages with one JSON-backed statement', async () => {
      const makeEntry = (i: number) => ({
        id: `entry-${i}`,
        times: {
          MC1: '1:00.000', DP1: '1:00.000', GV1: '1:00.000', BC1: '1:00.000',
          MC2: '1:00.000', DP2: '1:00.000', GV2: '1:00.000', BC2: '1:00.000',
          MC3: '1:00.000', DP3: '1:00.000', GV3: '1:00.000', BC3: '1:00.000',
          CI1: '1:00.000', CI2: '1:00.000', RR: '1:00.000',
          VL1: '1:00.000', VL2: '1:00.000', KB2: '1:00.000', MC4: '1:00.000', KB1: '1:00.000',
        },
        lives: 3,
        eliminated: false,
        stage: 'qualification',
        player: { id: `player-${i}` },
      });

      mockPrisma.tTEntry.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, i) => makeEntry(i)));

      await recalculateRanks('tournament-1', 'qualification', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const templateStrings = mockPrisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
      expect(templateStrings.raw.join('')).toContain('json_each');
    });

    it('should update large non-qualification stages with one JSON-backed statement', async () => {
      const makeEntry = (i: number) => ({
        id: `entry-${i}`,
        times: {
          MC1: '1:00.000', DP1: '1:00.000', GV1: '1:00.000', BC1: '1:00.000',
          MC2: '1:00.000', DP2: '1:00.000', GV2: '1:00.000', BC2: '1:00.000',
          MC3: '1:00.000', DP3: '1:00.000', GV3: '1:00.000', BC3: '1:00.000',
          CI1: '1:00.000', CI2: '1:00.000', RR: '1:00.000',
          VL1: '1:00.000', VL2: '1:00.000', KB2: '1:00.000', MC4: '1:00.000', KB1: '1:00.000',
        },
        lives: 3,
        eliminated: false,
        stage: 'revival_1',
        player: { id: `player-${i}` },
      });

      mockPrisma.tTEntry.findMany.mockResolvedValue(Array.from({ length: 36 }, (_, i) => makeEntry(i)));

      await recalculateRanks('tournament-1', 'revival_1', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const templateStrings = mockPrisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
      expect(templateStrings.raw.join('')).toContain('json_each');
    });

    it('requires callers to pass the stage explicitly', () => {
      expect(rerankStageAfterDelete).toHaveLength(3);
    });

    it('should rerank qualification after delete with a single rank-only update', async () => {
      await rerankStageAfterDelete('tournament-1', 'qualification', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.tTEntry.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const templateStrings = mockPrisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
      const sqlText = templateStrings.raw.join('');
      expect(sqlText).toContain('ROW_NUMBER() OVER');
      expect(sqlText).toContain('qualificationPoints');
      expect(sqlText).not.toContain('courseScores');
    });

    it('should rerank revival after delete and clear ranks for entries without totalTime', async () => {
      await rerankStageAfterDelete('tournament-1', 'revival_1', mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.tTEntry.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const templateStrings = mockPrisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray;
      const sqlText = templateStrings.raw.join('');
      expect(sqlText).toContain('totalTime IS NOT NULL');
      expect(sqlText).not.toContain('qualificationPoints');
    });
  });
});
