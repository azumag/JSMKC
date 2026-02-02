/**
 * @module qualification-scoring.test
 *
 * Test suite for TA qualification scoring module (`@/lib/ta/qualification-scoring`).
 *
 * Covers:
 * - generateScoreTable: linear interpolation of points from 50 (1st) to 0 (last)
 * - calculateCourseScores: per-course scoring with tie handling and missing times
 * - calculateAllCourseScores: full 20-course scoring pipeline with floor rounding
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

    it('should handle ties by averaging scores across tied positions', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:00.000' } }, // Same time as 'a'
        { id: 'c', times: { MC1: '1:30.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // N=3, score table = [50, 25, 0]
      // a and b tie at rank 1-2, so they average positions 0 and 1: (50 + 25) / 2 = 37.5
      expect(scores.get('a')).toBe(37.5);
      expect(scores.get('b')).toBe(37.5);
      expect(scores.get('c')).toBe(0);
    });

    it('should handle all players tied', () => {
      const entries = [
        { id: 'a', times: { MC1: '1:00.000' } },
        { id: 'b', times: { MC1: '1:00.000' } },
        { id: 'c', times: { MC1: '1:00.000' } },
      ];
      const scores = calculateCourseScores(entries, 'MC1');
      // N=3, score table = [50, 25, 0], average = (50+25+0)/3 = 25
      expect(scores.get('a')).toBe(25);
      expect(scores.get('b')).toBe(25);
      expect(scores.get('c')).toBe(25);
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

    it('should floor the total qualification points', () => {
      // 3 players with times on 1 course: scores will be [50, 25, 0]
      // If player B has times on 2 courses: 25 + 25 = 50 (integer, no floor needed)
      // Let's construct a case where floor matters
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

    it('should floor decimal totals correctly', () => {
      // 8 players on 1 course: rank 2 gets 50*(6/7) ≈ 42.857
      // If same result on 2 courses: 42.857 * 2 = 85.714, floor = 85
      const entries = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        times: {
          MC1: `1:${(10 + i).toString().padStart(2, '0')}.000`,
          DP1: `1:${(10 + i).toString().padStart(2, '0')}.000`,
        },
      }));

      const results = calculateAllCourseScores(entries);

      // Player p1 (rank 2 on both courses): 42.857 * 2 = 85.714 → floor = 85
      expect(results.get('p1')!.qualificationPoints).toBe(85);

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
  });
});
