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
  calculateQualificationPointsFromMatches: jest.fn(),
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
  clearOverallRankingsCache,
} from '@/lib/points/overall-ranking';

// ---------------------------------------------------------------------------
// Helpers to access mock implementations
// ---------------------------------------------------------------------------

function getMockCalculateAllCourseScores() {
  return jest.requireMock('@/lib/ta/qualification-scoring').calculateAllCourseScores as jest.Mock;
}

function getMockCalculateQualificationPointsFromMatches() {
  return jest.requireMock('@/lib/points/qualification-points').calculateQualificationPointsFromMatches as jest.Mock;
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
  // Match models for finals bracket analysis
  bMMatch: { findMany: jest.fn() },
  mRMatch: { findMany: jest.fn() },
  gPMatch: { findMany: jest.fn() },
  player: { findMany: jest.fn() },
  tournamentPlayerScore: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
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
    // The Phase-2 in-memory cache for calculateOverallRankings persists across
    // tests via module scope, so clear it here to keep each test independent.
    clearOverallRankingsCache();
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
      getMockCalculateQualificationPointsFromMatches().mockReturnValue([]);

      const result = await calculateBMQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.size).toBe(0);
    });

    it('maps results by player ID', async () => {
      mockPrisma.bMQualification.findMany.mockResolvedValue([
        { playerId: 'p1', wins: 5, ties: 1, losses: 2, mp: 8, player: PLAYER_P1 },
      ]);
      getMockCalculateQualificationPointsFromMatches().mockReturnValue([
        { playerId: 'p1', normalizedPoints: 700 },
      ]);

      const result = await calculateBMQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.get('p1')?.normalizedPoints).toBe(700);
    });

    it('normalizes by each player actual match count instead of total participants', async () => {
      mockPrisma.bMQualification.findMany.mockResolvedValue([
        ...Array.from({ length: 12 }, (_, i) => ({
          playerId: `a${i + 1}`,
          wins: i === 0 ? 11 : 0,
          ties: 0,
          losses: i === 0 ? 0 : 11,
          mp: 11,
          group: 'A',
          player: PLAYER_P1,
        })),
        ...Array.from({ length: 12 }, (_, i) => ({
          playerId: `b${i + 1}`,
          wins: 0,
          ties: 0,
          losses: 11,
          mp: 11,
          group: 'B',
          player: PLAYER_P2,
        })),
      ]);
      getMockCalculateQualificationPointsFromMatches().mockImplementation((records) =>
        records.map((record: { playerId: string; wins: number; ties: number; matchesPlayed: number }) => ({
          playerId: record.playerId,
          matchPoints: record.wins * 2 + record.ties,
          normalizedPoints: record.matchesPlayed === 0
            ? 0
            : Math.round((1000 * (record.wins * 2 + record.ties)) / (2 * record.matchesPlayed)),
          rank: 1,
        })),
      );

      const result = await calculateBMQualificationPointsFromDB(
        mockPrisma as any,
        TOURNAMENT_ID
      );

      expect(result.get('a1')?.normalizedPoints).toBe(1000);
      expect(getMockCalculateQualificationPointsFromMatches()).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ playerId: 'a1', matchesPlayed: 11 }),
          expect.objectContaining({ playerId: 'b1', matchesPlayed: 11 }),
        ]),
      );
    });
  });

  // =========================================================================
  describe('calculateMRQualificationPointsFromDB', () => {
    it('delegates to calculateQualificationPoints with MR data', async () => {
      mockPrisma.mRQualification.findMany.mockResolvedValue([
        { playerId: 'p2', wins: 3, ties: 0, losses: 4, mp: 7, player: PLAYER_P2 },
      ]);
      getMockCalculateQualificationPointsFromMatches().mockReturnValue([
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
        { playerId: 'p1', wins: 8, ties: 0, losses: 0, mp: 8, player: PLAYER_P1 },
      ]);
      getMockCalculateQualificationPointsFromMatches().mockReturnValue([
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
    /** Helper: build a completed finals match row for BM/MR */
    function makeMatch(matchNumber: number, round: string, player1Id: string, player2Id: string, score1: number, score2: number) {
      return { matchNumber, round, player1Id, player2Id, score1, score2 };
    }

    it('returns empty array when no completed finals exist (BM)', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'BM');

      expect(positions).toEqual([]);
    });

    it('determines 1st and 2nd from Grand Final winner/loser (BM)', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([
        makeMatch(16, 'grand_final', 'p1', 'p2', 5, 3),
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'BM');

      expect(positions.find(p => p.playerId === 'p1')).toEqual({ playerId: 'p1', position: 1 });
      expect(positions.find(p => p.playerId === 'p2')).toEqual({ playerId: 'p2', position: 2 });
    });

    it('uses GF Reset result when both GF and GF Reset are completed (BM)', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([
        makeMatch(16, 'grand_final', 'p1', 'p2', 3, 5), // GF: p2 wins
        makeMatch(17, 'grand_final_reset', 'p1', 'p2', 5, 2), // Reset: p1 wins
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'BM');

      // Reset result overrides GF result for 1st/2nd
      expect(positions.find(p => p.position === 1)?.playerId).toBe('p1');
      expect(positions.find(p => p.position === 2)?.playerId).toBe('p2');
    });

    it('assigns 3rd to Losers Final loser (MR)', async () => {
      mockPrisma.mRMatch.findMany.mockResolvedValue([
        makeMatch(15, 'losers_final', 'p3', 'p4', 3, 0), // p3 wins, p4 gets 3rd
        makeMatch(16, 'grand_final', 'p1', 'p3', 5, 2),  // p1 wins GF
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'MR');

      expect(positions.find(p => p.playerId === 'p4')?.position).toBe(3);
    });

    it('assigns 4th to Losers SF loser, 5th to Losers R3 losers, 7th to Losers R2 losers', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([
        makeMatch(16, 'grand_final', 'p1', 'p2', 5, 3),
        makeMatch(15, 'losers_final', 'p2', 'p3', 5, 2), // p3 gets 3rd
        makeMatch(14, 'losers_sf', 'p4', 'p5', 5, 1),   // p5 gets 4th
        makeMatch(12, 'losers_r3', 'p6', 'p7', 5, 0),   // p7 gets 5th
        makeMatch(13, 'losers_r3', 'p8', 'p9', 0, 5),   // p8 gets 5th
        makeMatch(10, 'losers_r2', 'p10', 'p11', 5, 2), // p11 gets 7th
        makeMatch(11, 'losers_r2', 'p12', 'p13', 1, 5), // p12 gets 7th
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'BM');

      expect(positions.find(p => p.playerId === 'p3')?.position).toBe(3);
      expect(positions.find(p => p.playerId === 'p5')?.position).toBe(4);
      expect(positions.find(p => p.playerId === 'p7')?.position).toBe(5);
      expect(positions.find(p => p.playerId === 'p8')?.position).toBe(5);
      expect(positions.find(p => p.playerId === 'p11')?.position).toBe(7);
      expect(positions.find(p => p.playerId === 'p12')?.position).toBe(7);
    });

    it('maps 16-player finals and Top24 playoff losses to standard point bands', async () => {
      mockPrisma.bMMatch.findMany.mockResolvedValue([
        { ...makeMatch(30, 'grand_final', 'p1', 'p2', 5, 3), stage: 'finals' },
        { ...makeMatch(29, 'losers_final', 'p2', 'p3', 5, 2), stage: 'finals' },
        { ...makeMatch(28, 'losers_sf', 'p4', 'p5', 5, 1), stage: 'finals' },
        { ...makeMatch(26, 'losers_r4', 'p6', 'p7', 5, 0), stage: 'finals' },
        { ...makeMatch(24, 'losers_r3', 'p8', 'p9', 5, 0), stage: 'finals' },
        { ...makeMatch(20, 'losers_r2', 'p10', 'p11', 5, 2), stage: 'finals' },
        { ...makeMatch(16, 'losers_r1', 'p12', 'p13', 5, 2), stage: 'finals' },
        { ...makeMatch(5, 'playoff_r2', 'p14', 'p15', 5, 2), stage: 'playoff' },
        { ...makeMatch(1, 'playoff_r1', 'p16', 'p17', 5, 2), stage: 'playoff' },
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'BM');

      expect(positions.find(p => p.playerId === 'p7')?.position).toBe(5);
      expect(positions.find(p => p.playerId === 'p9')?.position).toBe(7);
      expect(positions.find(p => p.playerId === 'p11')?.position).toBe(9);
      expect(positions.find(p => p.playerId === 'p13')?.position).toBe(13);
      expect(positions.find(p => p.playerId === 'p15')?.position).toBe(17);
      expect(positions.find(p => p.playerId === 'p17')?.position).toBe(21);
    });

    it('uses points1/points2 for GP mode', async () => {
      mockPrisma.gPMatch.findMany.mockResolvedValue([
        { matchNumber: 16, round: 'grand_final', player1Id: 'p1', player2Id: 'p2', points1: 18, points2: 15 },
      ]);

      const positions = await getMatchFinalsPositions(mockPrisma as any, TOURNAMENT_ID, 'GP');

      expect(mockPrisma.gPMatch.findMany).toHaveBeenCalled();
      expect(positions.find(p => p.playerId === 'p1')?.position).toBe(1);
      expect(positions.find(p => p.playerId === 'p2')?.position).toBe(2);
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
      getMockCalculateQualificationPointsFromMatches().mockReturnValue([]);
      // getMatchFinalsPositions now reads match tables; return empty (no finals played)
      mockPrisma.bMMatch.findMany.mockResolvedValue([]);
      mockPrisma.mRMatch.findMany.mockResolvedValue([]);
      mockPrisma.gPMatch.findMany.mockResolvedValue([]);
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
    it('uses deleteMany + createMany instead of N upserts (#752)', async () => {
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

      // Should use deleteMany+createMany (2 ops) not N upserts
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tournamentPlayerScore.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentPlayerScore.deleteMany).toHaveBeenCalledWith({
        where: { tournamentId: TOURNAMENT_ID },
      });
      expect(mockPrisma.tournamentPlayerScore.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ playerId: 'p1', totalPoints: 800, overallRank: 1 }),
          expect.objectContaining({ playerId: 'p2', totalPoints: 600, overallRank: 2 }),
        ]),
      });
    });

    it('no-ops gracefully when given an empty array', async () => {
      await saveOverallRankings(mockPrisma as any, TOURNAMENT_ID, []);

      // Early return: no DB calls at all when scores is empty
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentPlayerScore.deleteMany).not.toHaveBeenCalled();
    });
  });
});
