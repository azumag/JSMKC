/**
 * @module qualification-scoring.test
 *
 * Test suite for TA qualification scoring module (`@/lib/ta/qualification-scoring`).
 *
 * Covers:
 * - generateScoreTable: linear interpolation of points from 50 (1st) to 0 (last)
 * - calculateCourseScores: per-course scoring with tie handling and missing times
 * - calculateAllCourseScores: full 20-course scoring pipeline with rounded totals
 *
 * Tie handling and rounding follow the CDM Excel workbook semantics (issue #2768):
 * ties share the best rank's score (Excel RANK), and the total is rounded to the
 * nearest integer (Excel integer cell format), not floored.
 */

import {
  generateScoreTable,
  calculateCourseScores,
  calculateAllCourseScores,
} from '@/lib/ta/qualification-scoring';

describe('TA Qualification Scoring', () => {
  describe('generateScoreTable', () => {
    it('should return [50] for 1 participant', () => {
      expect(generateScoreTable(1)).toEqual([50]);
    });

    it('should return [50, 0] for 2 participants', () => {
      expect(generateScoreTable(2)).toEqual([50, 0]);
    });

    it('should return [50, 25, 0] for 3 participants', () => {
      expect(generateScoreTable(3)).toEqual([50, 25, 0]);
    });

    it('should generate linearly interpolated scores for 8 participants', () => {
      const table = generateScoreTable(8);
      expect(table.length).toBe(8);

      // First = 50, Last = 0
      expect(table[0]).toBe(50);
      expect(table[7]).toBe(0);

      // Check specific intermediate values: 50 * (7-i)/7
      expect(table[1]).toBeCloseTo(42.857, 2);
      expect(table[2]).toBeCloseTo(35.714, 2);
      expect(table[3]).toBeCloseTo(28.571, 2);
      expect(table[4]).toBeCloseTo(21.429, 2);
      expect(table[5]).toBeCloseTo(14.286, 2);
      expect(table[6]).toBeCloseTo(7.143, 2);
    });

    it('should return empty array for 0 participants', () => {
      expect(generateScoreTable(0)).toEqual([]);
    });

    it('should return empty array for negative participants', () => {
      expect(generateScoreTable(-1)).toEqual([]);
    });
  });

  describe('calculateCourseScores', () => {
    it('should assign 50 to fastest and 0 to slowest for 2 players', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:30.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBe(0);
    });

    it('should handle 3 players with correct interpolation', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:15.000' } },
        { id: 'c', times: { MC1: '1:30.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBe(25);
      expect(scores.get('c')).toBe(0);
    });

    it('should give 0 to players without a time for the course', () => {
      const entries: Array<{ id: string; times: Record<string, string> | null }> = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:30.000' } },
        { id: 'c', times: null },
        { id: 'd', times: { DP1: '1:00.000' } }, // Different course, no MC1
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // Only a and b have valid times, so N=2
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBe(0);
      expect(scores.get('c')).toBe(0);
      expect(scores.get('d')).toBe(0);
    });

    it('should give tied players the best rank score (Excel RANK semantics)', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:00.000' } }, // Same time as 'a'
        { id: 'c', times: { MC1: '1:30.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // N=3, score table = [50, 25, 0]
      // a and b tie at rank 1 (competition ranking, like Excel RANK): both get 50.
      // c is rank 3 (rank 2 is skipped): 0 points.
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBe(50);
      expect(scores.get('c')).toBe(0);
    });

    it('should give mid-table tied players the score of their shared min rank', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:15.000' } },
        { id: 'c', times: { MC1: '1:15.000' } }, // Same time as 'b'
        { id: 'd', times: { MC1: '1:30.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // N=4, score table = [50, 100/3, 50/3, 0]
      // b and c tie at rank 2: both get the rank-2 score (100/3); d stays rank 4.
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBeCloseTo(100 / 3, 10);
      expect(scores.get('c')).toBeCloseTo(100 / 3, 10);
      expect(scores.get('d')).toBe(0);
    });

    it('should handle all players tied', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:00.000' } },
        { id: 'c', times: { MC1: '1:00.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // All tie at rank 1: everyone receives the rank-1 score (50), as Excel RANK would.
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBe(50);
      expect(scores.get('c')).toBe(50);
    });

    it('should give sole participant 50 points', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      expect(scores.get('a')).toBe(50);
    });

    it('should give sole valid-time player 50 points among many entries', () => {
      const entries: Array<{ id: string; times: Record<string, string> | null }> = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: null },
        { id: 'c', times: {} },
        { id: 'd', times: { DP1: '1:00.000' } },
        { id: 'e', times: { MC1: '' } }, // Empty string = no valid time
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // Only 'a' has a valid MC1 time, so N=1: sole participant gets 50
      expect(scores.get('a')).toBe(50);
      expect(scores.get('b')).toBe(0);
      expect(scores.get('c')).toBe(0);
      expect(scores.get('d')).toBe(0);
      expect(scores.get('e')).toBe(0);
    });

    it('should return 0 for all when no one has a time', () => {
      const entries = [
        { id: 'a', times: null },
        { id: 'b', times: {} },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      expect(scores.get('a')).toBe(0);
      expect(scores.get('b')).toBe(0);
    });
  });

  describe('calculateAllCourseScores', () => {
    it('should calculate total qualification points across courses', () => {
      // 2 players, 2 courses with times. Player A is faster on both.
      const entries = [
        { id: 'a', times: { MC1: '1:00.000', DP1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:30.000', DP1: '1:30.000' } },
      ];
      const results = calculateAllCourseScores(entries);

      const resultA = results.get('a')!;
      const resultB = results.get('b')!;

      // Player A: 50 + 50 = 100 for the 2 courses with times, 0 for the other 18
      expect(resultA.courseScores['MC1']).toBe(50);
      expect(resultA.courseScores['DP1']).toBe(50);
      expect(resultA.qualificationPoints).toBe(100);

      // Player B: 0 + 0 = 0 for the 2 courses
      expect(resultB.courseScores['MC1']).toBe(0);
      expect(resultB.courseScores['DP1']).toBe(0);
      expect(resultB.qualificationPoints).toBe(0);
    });

    it('should keep integer totals intact', () => {
      // 3 players with times on 3 courses: per-course scores are [50, 25, 0],
      // so every total is already an integer and rounding must not change it.
      const entries = [
        { id: 'a', times: { MC1: '1:00.000', DP1: '1:00.000', GV1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:15.000', DP1: '1:15.000', GV1: '1:15.000' } },
        { id: 'c', times: { MC1: '1:30.000', DP1: '1:30.000', GV1: '1:30.000' } },
      ];
      const results = calculateAllCourseScores(entries);

      // Player A: 50 * 3 = 150 for 3 courses
      expect(results.get('a')!.qualificationPoints).toBe(150);

      // Player B: 25 * 3 = 75 for 3 courses
      expect(results.get('b')!.qualificationPoints).toBe(75);

      // Player C: 0 * 3 = 0
      expect(results.get('c')!.qualificationPoints).toBe(0);
    });

    it('should round decimal totals to the nearest integer (Excel display rounding)', () => {
      // 8 players on 1 course: rank 2 gets 50*(6/7) ≈ 42.857
      // If same result on 2 courses: 42.857 * 2 = 85.714 → round = 86.
      // (The old floor() behavior yielded 85; Excel's integer cell format
      //  rounds, so the app must round too — issue #2768.)
      const entries = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        times: {
          MC1: `1:${(10 + i).toString().padStart(2, '0')}.000`,
          DP1: `1:${(10 + i).toString().padStart(2, '0')}.000`,
        },
      }));

      const results = calculateAllCourseScores(entries);

      // Player p1 (rank 2 on both courses): 42.857 * 2 = 85.714 → round = 86
      expect(results.get('p1')!.qualificationPoints).toBe(86);

      // Player p0 (rank 1 on both courses): 50 * 2 = 100
      expect(results.get('p0')!.qualificationPoints).toBe(100);

      // Player p7 (rank 8 on both courses): 0 * 2 = 0
      expect(results.get('p7')!.qualificationPoints).toBe(0);
    });

    it('should handle empty entries', () => {
      const results = calculateAllCourseScores([]);
      expect(results.size).toBe(0);
    });

    it('should assign 0 for courses without times', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: null },
      ];
      const results = calculateAllCourseScores(entries);

      // Player A: 50 on MC1 (sole participant), 0 on all other 19 courses
      expect(results.get('a')!.courseScores['MC1']).toBe(50);
      expect(results.get('a')!.courseScores['DP1']).toBe(0);
      expect(results.get('a')!.qualificationPoints).toBe(50);

      // Player B: 0 on all courses
      expect(results.get('b')!.qualificationPoints).toBe(0);
    });

    /* Regression for issue #575 — E2E mirror TC-812.
     *
     * TA has no manual rankOverride: when two players submit identical times on
     * every course, the shared-min-rank tie rule is the ONLY mechanism that
     * keeps their totals equal. If `calculateCourseScores` ever regressed into
     * assigning the deterministic rank-1 score to only the "first" tied entry,
     * the resulting qualificationPoints would diverge by 20 * (50 - 25) = 500
     * points with N=3, producing a false ordering in TA standings. */
    it('returns identical qualificationPoints across all 20 courses when two entries tie on every course', () => {
      const identicalTimes = {
        MC1: '1:00.200', DP1: '1:00.200', GV1: '1:00.200', BC1: '1:00.200', MC2: '1:00.200',
        CI1: '1:00.200', GV2: '1:00.200', DP2: '1:00.200', BC2: '1:00.200', MC3: '1:00.200',
        KB1: '1:00.200', CI2: '1:00.200', VL1: '1:00.200', BC3: '1:00.200', MC4: '1:00.200',
        DP3: '1:00.200', KB2: '1:00.200', GV3: '1:00.200', VL2: '1:00.200', RR: '1:00.200',
      };
      const slowerTimes = Object.fromEntries(
        Object.keys(identicalTimes).map((course) => [course, '1:00.600']),
      );

      const entries = [
        { id: 'tiedA', times: identicalTimes },
        { id: 'tiedB', times: { ...identicalTimes } },
        { id: 'slow',  times: slowerTimes },
      ];
      const results = calculateAllCourseScores(entries);

      // N=3, table [50, 25, 0]. Tied at rank 1 ⇒ both receive 50 pts per course
      // (Excel RANK semantics), 50 * 20 = 1000 for both.
      expect(results.get('tiedA')!.qualificationPoints).toBe(1000);
      expect(results.get('tiedB')!.qualificationPoints).toBe(1000);
      expect(results.get('tiedA')!.qualificationPoints)
        .toBe(results.get('tiedB')!.qualificationPoints);
      expect(results.get('slow')!.qualificationPoints).toBe(0);

      // Spot-check that per-course scores share the min-rank score, not just
      // the total. A course-level regression could otherwise cancel out across
      // the 20 courses by coincidence.
      expect(results.get('tiedA')!.courseScores['MC1']).toBe(50);
      expect(results.get('tiedB')!.courseScores['RR']).toBe(50);
      expect(results.get('slow')!.courseScores['MC1']).toBe(0);
    });

    /* Regression for issue #2768 — CDM Excel score mismatch.
     *
     * In CDM 2025, Moll and Leyla finished with the same sum of per-course
     * ranks over all 20 tracks, so the Excel workbook (which derives points
     * as (Σ(N - rank) / 20) / (N - 1) * 1000 and displays them rounded)
     * showed 811 for both. The app gave 810/809 because (a) ties were
     * averaged across positions and (b) totals were floored. With Excel
     * semantics, any two players whose rank multisets coincide must receive
     * identical rounded totals. */
    it('gives identical rounded totals to players with equal rank sums (issue #2768)', () => {
      // 4 players, 2 courses. 'x' and 'y' swap ranks 2 and 3 between the two
      // courses, so their rank multisets are equal ({2,3}) while their times
      // differ. 'fast' and 'slow' pin ranks 1 and 4 on both courses.
      const entries = [
        { id: 'fast', times: { MC1: '1:00.000', DP1: '1:00.000' } },
        { id: 'x',    times: { MC1: '1:10.000', DP1: '1:20.000' } },
        { id: 'y',    times: { MC1: '1:20.000', DP1: '1:10.000' } },
        { id: 'slow', times: { MC1: '1:30.000', DP1: '1:30.000' } },
      ];
      const results = calculateAllCourseScores(entries);

      // N=4 per course: rank2 = 100/3 ≈ 33.33, rank3 = 50/3 ≈ 16.67.
      // Both x and y total 100/3 + 50/3 = 50 exactly.
      expect(results.get('x')!.qualificationPoints).toBe(50);
      expect(results.get('y')!.qualificationPoints).toBe(50);
      expect(results.get('x')!.qualificationPoints)
        .toBe(results.get('y')!.qualificationPoints);
    });

    it('rounds totals up like the Excel integer display, where floor would diverge (issue #2768)', () => {
      // A player at rank 2 on both courses (N=4) totals 100/3 + 100/3 =
      // 66.67 → round = 67. The previous floor() gave 66 and diverged from
      // the workbook, which shows the raw float through a "0" cell format.
      const results = calculateAllCourseScores([
        { id: 'fast', times: { MC1: '1:00.000', DP1: '1:00.000' } },
        { id: 'p2',   times: { MC1: '1:10.000', DP1: '1:10.000' } },
        { id: 'p3',   times: { MC1: '1:20.000', DP1: '1:20.000' } },
        { id: 'slow', times: { MC1: '1:30.000', DP1: '1:30.000' } },
      ]);
      expect(results.get('p2')!.qualificationPoints).toBe(67);
    });
  });
});
