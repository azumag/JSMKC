/**
 * Unit tests for the Overall Ranking calculation module.
 *
 * Tests the aggregation of points across all 4 competition modes (TA, BM, MR, GP)
 * to produce tournament-wide player rankings. Covers:
 *
 * - calculateTAQualificationPointsFromDB: TA points from TT entries
 * - calculateBMQualificationPointsFromDB: BM points from BMQualification records
 * - calculateMRQualificationPointsFromDB: MR points from MRQualification records
 * - calculateGPQualificationPointsFromDB: GP points from GPQualification records
 * - getTAFinalsPositions: Placement lookup from phase3 TTEntry data
 * - getMatchFinalsPositions: Provisional placement from qualification rankings
 * - calculateOverallRankings: Full aggregation + rank assignment
 * - getOverallRankings: Loading pre-computed rankings from DB
 * - saveOverallRankings: Persisting rankings via upsert
 */

// Mocks must be declared before imports so Jest can hoist them
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('@/lib/ta/qualification-scoring', () => ({
  calculateAllCourseScores: jest.fn(),
}));

jest.mock('@/lib/points/qualification-points', () => ({
  calculateQualificationPoints: jest.fn(),
}));

jest.mock('@/lib/points/finals-points', () => ({
  getFinalsPoints: jest.fn(),
}));

import {
  calculateTAQualificationPointsFromDB,
  calculateBMQualificationPointsFromDB,
  calculateMRQualificationPointsFromDB,
  calculateGPQualificationPointsFromDB,
  getTAFinalsPositions,
  getMatchFinalsPositions,
  calculateOverallRankings,
  saveOverallRankings,
  getOverallRankings,
} from '@/lib/points/overall-ranking';

// ---------------------------------------------------------------------------
// Helpers to access mock implementations
// ---------------------------------------------------------------------------

function getMockCalculateAllCourseScores() {
  return jest.requireMock('@/lib/ta/qualification-scoring').calculateAllCourseScores as jest.Mock;
}

function getMockCalculateQualificationPoints() {
  return jest.requireMock('@/lib/points/qualification-points').calculateQualificationPoints as jest.Mock;
}

function getMockGetFinalsPoints() {
  return jest.requireMock('@/lib/points/finals-points').getFinalsPoints as jest.Mock;
}

// ---------------------------------------------------------------------------
// Mock Prisma client (separate from the global jest.setup.js prisma mock)
// ---------------------------------------------------------------------------

const mockPrisma = {
  tTEntry: { findMany: jest.fn() },
  bMQualification: { findMany: jest.fn() },
  mRQualification: { findMany: jest.fn() },
  gPQualification: { findMany: jest.fn() },
  player: { findMany: jest.fn() },
  tournamentPlayerScore: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TOURNAMENT_ID = 'tournament-1';
const PLAYER_P1 = { id: 'p1', name: 'Alice', nickname: 'alice' };
const PLAYER_P2 = { id: 'p2', name: 'Bob', nickname: 'bob' };

describe('Overall Ranking module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  describe('calculateTAQualificationPointsFromDB', () => {
    it('returns empty map when no entries exist', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([]);
      getMockCalculateAllCourseScores().mockReturnValue(new Map());

      const result = await calculateTAQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.size).toBe(0);
    });

    it('maps course scores to player IDs', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([
        { id: 'e1', playerId: 'p1', times: { course1: '1:30.00' }, player: PLAYER_P1 },
      ]);
      getMockCalculateAllCourseScores().mockReturnValue(
        new Map([['e1', { courseScores: { course1: 500 }, qualificationPoints: 800 }]])
      );

      const result = await calculateTAQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.get('p1')).toEqual({
        playerId: 'p1',
        coursePoints: { course1: 500 },
        totalPoints: 800,
      });
    });

    it('queries only qualification stage entries', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([]);
      getMockCalculateAllCourseScores().mockReturnValue(new Map());

      await calculateTAQualificationPointsFromDB(mockPrisma as any, TOURNAMENT_ID);

      expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stage: 'qualification' }),
        })
      );
    });
  });

  // =========================================================================
  describe('calculateBMQualificationPointsFromDB', () => {
    it('returns empty map when no qualifications exist', async () => {
      mockPrisma.bMQualification.findMany.mockResolvedValue([]);
      getMockCalculateQualificationPoints().mockReturnValue([]);

      const result = await calculateBMQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.size).toBe(0);
    });

    it('maps results by player ID', async () => {
      mockPrisma.bMQualification.findMany.mockResolvedValue([
        { playerId: 'p1', wins: 5, ties: 1, losses: 2, player: PLAYER_P1 },
      ]);
      getMockCalculateQualificationPoints().mockReturnValue([
        { playerId: 'p1', normalizedPoints: 700 },
      ]);

      const result = await calculateBMQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.get('p1')?.normalizedPoints).toBe(700);
    });
  });

  // =========================================================================
  describe('calculateMRQualificationPointsFromDB', () => {
    it('delegates to calculateQualificationPoints with MR data', async () => {
      mockPrisma.mRQualification.findMany.mockResolvedValue([
        { playerId: 'p2', wins: 3, ties: 0, losses: 4, player: PLAYER_P2 },
      ]);
      getMockCalculateQualificationPoints().mockReturnValue([
        { playerId: 'p2', normalizedPoints: 400 },
      ]);

      const result = await calculateMRQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.get('p2')?.normalizedPoints).toBe(400);
      expect(mockPrisma.mRQualification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tournamentId: TOURNAMENT_ID } })
      );
    });
  });

  // =========================================================================
  describe('calculateGPQualificationPointsFromDB', () => {
    it('delegates to calculateQualificationPoints with GP data', async () => {
      mockPrisma.gPQualification.findMany.mockResolvedValue([
        { playerId: 'p1', wins: 8, ties: 0, losses: 0, player: PLAYER_P1 },
      ]);
      getMockCalculateQualificationPoints().mockReturnValue([
        { playerId: 'p1', normalizedPoints: 1000 },
      ]);

      const result = await calculateGPQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.get('p1')?.normalizedPoints).toBe(1000);
    });
  });

  // =========================================================================
  describe('getTAFinalsPositions', () => {
    it('returns positions from phase3 entries', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValueOnce([
        { playerId: 'p1', eliminated: false, lives: 2, totalTime: 90000 },
        { playerId: 'p2', eliminated: true, lives: 0, totalTime: 95000 },
      ]);

      const positions = await getTAFinalsPositions(mockPrisma as any, TOURNAMENT_ID);

      expect(positions).toEqual([
        { playerId: 'p1', position: 1 },
        { playerId: 'p2', position: 2 },
      ]);
    });

    it('falls back to legacy "finals" stage when phase3 is empty', async () => {
      mockPrisma.tTEntry.findMany
        .mockResolvedValueOnce([]) // phase3 returns nothing
        .mockResolvedValueOnce([
          { playerId: 'p1', eliminated: false, lives: 1, totalTime: 80000 },
        ]);

      const positions = await getTAFinalsPositions(mockPrisma as any, TOURNAMENT_ID);

      expect(positions).toEqual([{ playerId: 'p1', position: 1 }]);
      expect(mockPrisma.tTEntry.findMany).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when neither phase3 nor legacy finals exist', async () => {
      mockPrisma.tTEntry.findMany.mockResolvedValue([]);

      const positions = await getTAFinalsPositions(mockPrisma as any, TOURNAMENT_ID);

      expect(positions).toEqual([]);
    });
  });

  // =========================================================================
  describe('getMatchFinalsPositions', () => {
    it('returns top 16 players by qualification score for BM', async () => {
      const quals = Array.from({ length: 20 }, (_, i) => ({ playerId: `p${i + 1}` }));
      mockPrisma.bMQualification.findMany.mockResolvedValue(quals);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'BM');

      expect(positions).toHaveLength(16);
      expect(positions[0]).toEqual({ playerId: 'p1', position: 1 });
      expect(positions[15]).toEqual({ playerId: 'p16', position: 16 });
    });

    it('returns all players if fewer than 16 exist (MR)', async () => {
      mockPrisma.mRQualification.findMany.mockResolvedValue([
        { playerId: 'p1' },
        { playerId: 'p2' },
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'MR');

      expect(positions).toHaveLength(2);
    });

    it('uses GP qualifications when mode is GP', async () => {
      mockPrisma.gPQualification.findMany.mockResolvedValue([{ playerId: 'p1' }]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'GP');

      expect(mockPrisma.gPQualification.findMany).toHaveBeenCalled();
      expect(positions[0]).toEqual({ playerId: 'p1', position: 1 });
    });
  });

  // =========================================================================
  describe('calculateOverallRankings', () => {
    /** Helper: set up all prisma mocks for two players with only TA qual points.
     *
     * calculateOverallRankings calls tTEntry.findMany 4 times:
     *   1. Collect player IDs from qual stage (select: { playerId })
     *   2. calculateTAQualificationPointsFromDB (include: { player })
     *   3. getTAFinalsPositions → phase3 query (returns [])
     *   4. getTAFinalsPositions → legacy "finals" fallback (returns [])
     */
    function setupTwoPlayerMocks(p1Points: number, p2Points: number) {
      const p1Entry = { id: 'e1', playerId: 'p1', times: {}, player: PLAYER_P1 };
      const p2Entry = { id: 'e2', playerId: 'p2', times: {}, player: PLAYER_P2 };

      mockPrisma.tTEntry.findMany
        .mockResolvedValueOnce([p1Entry, p2Entry])  // call 1: collect player IDs
        .mockResolvedValueOnce([p1Entry, p2Entry])  // call 2: calculateTAQualificationPointsFromDB
        .mockResolvedValueOnce([])                   // call 3: getTAFinalsPositions phase3 (empty)
        .mockResolvedValueOnce([]);                  // call 4: getTAFinalsPositions legacy fallback

      getMockCalculateAllCourseScores().mockReturnValue(
        new Map([
          ['e1', { courseScores: {}, qualificationPoints: p1Points }],
          ['e2', { courseScores: {}, qualificationPoints: p2Points }],
        ])
      );

      mockPrisma.bMQualification.findMany.mockResolvedValue([]);
      mockPrisma.mRQualification.findMany.mockResolvedValue([]);
      mockPrisma.gPQualification.findMany.mockResolvedValue([]);
      getMockCalculateQualificationPoints().mockReturnValue([]);
      mockPrisma.player.findMany.mockResolvedValue([PLAYER_P1, PLAYER_P2]);
      getMockGetFinalsPoints().mockReturnValue(0);
    }

    it('assigns rank 1 to the player with the highest total points', async () => {
      setupTwoPlayerMocks(800, 600);

      const rankings = await calculateOverallRankings(mockPrisma as any, TOURNAMENT_ID);

      const p1 = rankings.find(r => r.playerId === 'p1')!;
      const p2 = rankings.find(r => r.playerId === 'p2')!;

      expect(p1.overallRank).toBe(1);
      expect(p1.taQualificationPoints).toBe(800);
      expect(p2.overallRank).toBe(2);
      expect(p2.taQualificationPoints).toBe(600);
    });

    it('assigns the same rank to tied players (standard competition ranking)', async () => {
      setupTwoPlayerMocks(500, 500);

      const rankings = await calculateOverallRankings(mockPrisma as any, TOURNAMENT_ID);

      // Both share rank 1 (1224 style — neither gets rank 2)
      expect(rankings.every(r => r.overallRank === 1)).toBe(true);
    });

    it('includes player name and nickname in the result', async () => {
      setupTwoPlayerMocks(800, 600);

      const rankings = await calculateOverallRankings(mockPrisma as any, TOURNAMENT_ID);

      const p1 = rankings.find(r => r.playerId === 'p1')!;
      expect(p1.playerName).toBe('Alice');
      expect(p1.playerNickname).toBe('alice');
    });
  });

  // =========================================================================
  describe('getOverallRankings', () => {
    it('maps stored records to PlayerTournamentScore', async () => {
      mockPrisma.tournamentPlayerScore.findMany.mockResolvedValue([{
        playerId: 'p1',
        player: PLAYER_P1,
        taQualificationPoints: 800,
        bmQualificationPoints: 700,
        mrQualificationPoints: 600,
        gpQualificationPoints: 500,
        taFinalsPoints: 2000,
        bmFinalsPoints: 1800,
        mrFinalsPoints: 1600,
        gpFinalsPoints: 1400,
        totalPoints: 9400,
        overallRank: 1,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }]);

      const rankings = await getOverallRankings(mockPrisma as any, TOURNAMENT_ID);

      expect(rankings).toHaveLength(1);
      expect(rankings[0]).toMatchObject({
        playerId: 'p1',
        playerName: 'Alice',
        totalPoints: 9400,
        overallRank: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('returns empty array when no scores saved yet', async () => {
      mockPrisma.tournamentPlayerScore.findMany.mockResolvedValue([]);

      const rankings = await getOverallRankings(mockPrisma as any, TOURNAMENT_ID);

      expect(rankings).toHaveLength(0);
    });
  });

  // =========================================================================
  describe('saveOverallRankings', () => {
    it('calls $transaction with one upsert per player', async () => {
      mockPrisma.tournamentPlayerScore.upsert.mockResolvedValue({});
      mockPrisma.$transaction.mockResolvedValue([]);

      const scores = [
        {
          playerId: 'p1', playerName: 'Alice', playerNickname: 'alice',
          taQualificationPoints: 800, bmQualificationPoints: 0,
          mrQualificationPoints: 0, gpQualificationPoints: 0,
          taFinalsPoints: 0, bmFinalsPoints: 0, mrFinalsPoints: 0, gpFinalsPoints: 0,
          totalPoints: 800, overallRank: 1,
        },
        {
          playerId: 'p2', playerName: 'Bob', playerNickname: 'bob',
          taQualificationPoints: 600, bmQualificationPoints: 0,
          mrQualificationPoints: 0, gpQualificationPoints: 0,
          taFinalsPoints: 0, bmFinalsPoints: 0, mrFinalsPoints: 0, gpFinalsPoints: 0,
          totalPoints: 600, overallRank: 2,
        },
      ];

      await saveOverallRankings(mockPrisma as any, TOURNAMENT_ID, scores);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tournamentPlayerScore.upsert).toHaveBeenCalledTimes(2);
    });

    it('no-ops gracefully when given an empty array', async () => {
      mockPrisma.$transaction.mockResolvedValue([]);

      await saveOverallRankings(mockPrisma as any, TOURNAMENT_ID, []);

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([]);
    });
  });
});
