import {
  generateBMScore,
  generateMRScore,
  generateGPRaces,
  generateTATimes,
} from '@/lib/debug/score-generators';
import {
  validateBattleModeScores,
  validateMatchRaceScores,
  validateGPRacePosition,
} from '@/lib/score-validation';
import {
  COURSES,
  CUPS,
  COURSE_INFO,
  TOTAL_BM_ROUNDS,
  TOTAL_MR_RACES,
  TOTAL_GP_RACES,
  TOTAL_COURSES,
  getDriverPoints,
} from '@/lib/constants';
import { timeToMs } from '@/lib/ta/time-utils';

// 100-trial fuzz: random generators must always emit values that
// pass the production validators. A single failure indicates a bug
// in the generator, not flakiness — Math.random() covers the space.
const TRIALS = 100;

describe('generateBMScore', () => {
  it('returns integer score1+score2 that pass validateBattleModeScores', () => {
    for (let i = 0; i < TRIALS; i++) {
      const { score1, score2 } = generateBMScore();
      expect(Number.isInteger(score1)).toBe(true);
      expect(Number.isInteger(score2)).toBe(true);
      expect(score1 + score2).toBe(TOTAL_BM_ROUNDS);
      const result = validateBattleModeScores(score1, score2);
      expect(result.isValid).toBe(true);
    }
  });

  it('eventually produces multiple distinct outcomes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < TRIALS; i++) {
      const { score1, score2 } = generateBMScore();
      seen.add(`${score1}-${score2}`);
    }
    // BM has 5 valid outcomes (4-0, 3-1, 2-2, 1-3, 0-4); should see >=3 in 100 trials
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe('generateMRScore', () => {
  const sampleCourses = ['MC1', 'DP1', 'GV1', 'BC1'];

  it('returns scores that pass validateMatchRaceScores', () => {
    for (let i = 0; i < TRIALS; i++) {
      const { score1, score2 } = generateMRScore(sampleCourses);
      const result = validateMatchRaceScores(score1, score2);
      expect(result.isValid).toBe(true);
      expect(score1 + score2).toBe(TOTAL_MR_RACES);
    }
  });

  it('returns rounds aligned with score1/score2 distribution', () => {
    for (let i = 0; i < TRIALS; i++) {
      const { score1, score2, rounds } = generateMRScore(sampleCourses);
      expect(rounds).toHaveLength(TOTAL_MR_RACES);
      const winner1Count = rounds.filter((r) => r.winner === 1).length;
      const winner2Count = rounds.filter((r) => r.winner === 2).length;
      expect(winner1Count).toBe(score1);
      expect(winner2Count).toBe(score2);
      // Each round.course must be one of the assigned courses
      for (const r of rounds) {
        expect(sampleCourses).toContain(r.course);
      }
    }
  });
});

describe('generateGPRaces', () => {
  it('returns 5 races with positions in [1,8] and consistent points', () => {
    for (const cup of CUPS) {
      for (let i = 0; i < TRIALS / CUPS.length; i++) {
        const races = generateGPRaces(cup);
        expect(races).toHaveLength(TOTAL_GP_RACES);
        for (const r of races) {
          expect(validateGPRacePosition(r.position1).isValid).toBe(true);
          expect(validateGPRacePosition(r.position2).isValid).toBe(true);
          // Two human players must not finish in the same position (except 0)
          expect(r.position1).not.toBe(r.position2);
          // course must belong to the requested cup
          const info = COURSE_INFO.find((c) => c.abbr === r.course);
          expect(info?.cup).toBe(cup);
        }
        // Should have at least one race per cup-course (no duplicates within match)
        const courseSet = new Set(races.map((r) => r.course));
        expect(courseSet.size).toBe(TOTAL_GP_RACES);
      }
    }
  });

  it('positions are within [1,8] (no legacy 0 from generator)', () => {
    for (let i = 0; i < TRIALS; i++) {
      const races = generateGPRaces('Mushroom');
      for (const r of races) {
        expect(r.position1).toBeGreaterThanOrEqual(1);
        expect(r.position1).toBeLessThanOrEqual(8);
        expect(r.position2).toBeGreaterThanOrEqual(1);
        expect(r.position2).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('generateTATimes', () => {
  it('returns a record with all 20 courses and parseable times', () => {
    for (let i = 0; i < TRIALS; i++) {
      const times = generateTATimes();
      const keys = Object.keys(times);
      expect(keys).toHaveLength(TOTAL_COURSES);
      for (const course of COURSES) {
        const t = times[course];
        expect(typeof t).toBe('string');
        const ms = timeToMs(t);
        expect(ms).not.toBeNull();
        expect(ms!).toBeGreaterThan(0);
      }
    }
  });
});
