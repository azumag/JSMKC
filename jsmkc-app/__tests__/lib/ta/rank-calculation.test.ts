import { calculateEntryTotal, sortByStage, assignRanks } from '@/lib/ta/rank-calculation';

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
        },
        lives: 3,
        eliminated: false,
      };

      const result = calculateEntryTotal(entry);
      expect(result.totalTime).toBe(290357);
      expect(result.lives).toBe(3);
      expect(result.eliminated).toBe(false);
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
    const entries = [
      {
        id: '1',
        totalTime: 290357,
        lives: 3,
        eliminated: false,
        stage: 'qualification',
      },
      {
        id: '2',
        totalTime: 754567,
        lives: 2,
        eliminated: false,
        stage: 'qualification',
      },
      {
        id: '3',
        totalTime: null,
        lives: 3,
        eliminated: false,
        stage: 'qualification',
      },
      {
        id: '4',
        totalTime: 830456,
        lives: 3,
        eliminated: false,
        stage: 'qualification',
      },
    ];

    const sorted = sortByStage(entries, 'qualification');

    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('4');
    expect(sorted[3].id).toBe('3');
  });

  describe('sortByStage - finals', () => {
    const entries = [
      {
        id: '1',
        totalTime: 290357,
        lives: 3,
        eliminated: false,
        stage: 'finals',
      },
      {
        id: '2',
        totalTime: 754567,
        lives: 2,
        eliminated: false,
        stage: 'finals',
      },
      {
        id: '3',
        totalTime: 830456,
        lives: 1,
        eliminated: false,
        stage: 'finals',
      },
      {
        id: '4',
        totalTime: null,
        lives: 3,
        eliminated: true,
        stage: 'finals',
      },
    ];

    const sorted = sortByStage(entries, 'finals');

    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('3');
    expect(sorted[3].id).toBe('4');
  });

  describe('sortByStage - revival', () => {
    const entries = [
      {
        id: '1',
        totalTime: 290357,
        lives: 3,
        eliminated: false,
        stage: 'revival_1',
      },
      {
        id: '2',
        totalTime: 754567,
        lives: 2,
        eliminated: false,
        stage: 'revival_1',
      },
      {
        id: '3',
        totalTime: null,
        lives: 1,
        eliminated: false,
        stage: 'revival_1',
      },
    ];

    const sorted = sortByStage(entries, 'revival_1');

    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('3');
  });

  describe('assignRanks', () => {
    it('should assign sequential ranks to sorted entries', () => {
      const entries = [
        { id: '1', totalTime: 100, lives: 3, eliminated: false, stage: 'qualification' },
        { id: '2', totalTime: 200, lives: 2, eliminated: false, stage: 'qualification' },
        { id: '3', totalTime: 300, lives: 1, eliminated: false, stage: 'qualification' },
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
});
