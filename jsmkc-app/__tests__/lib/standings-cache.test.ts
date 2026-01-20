import {
  get,
  set,
  generateETag,
  invalidate,
  isExpired,
  clear,
  type CachedStandings,
} from '@/lib/standings-cache';

describe('standings-cache', () => {
  beforeEach(() => {
    clear();
  });

  afterEach(() => {
    clear();
  });

  describe('get', () => {
    it('should return null for non-existent key', () => {
      const result = get('tournament-1', 'finals');

      expect(result).toBeNull();
    });

    it('should return cached data for existing key', () => {
      const mockData = [{ id: 1, rank: 1 }];
      const mockETag = 'abc123';
      const mockLastUpdated = new Date().toISOString();

      set('tournament-1', 'finals', mockData, mockETag);

      const result = get('tournament-1', 'finals');

      expect(result).not.toBeNull();
      expect(result?.data).toEqual(mockData);
      expect(result?.lastUpdated).toBe(mockLastUpdated);
      expect(result?.etag).toBe(mockETag);
    });

    it('should return correct data for different stages', () => {
      const finalsData = [{ stage: 'finals' }];
      const prelimsData = [{ stage: 'prelims' }];

      set('tournament-1', 'finals', finalsData, 'etag1');
      set('tournament-1', 'prelims', prelimsData, 'etag2');

      const finalsResult = get('tournament-1', 'finals');
      const prelimsResult = get('tournament-1', 'prelims');

      expect(finalsResult?.data).toEqual(finalsData);
      expect(prelimsResult?.data).toEqual(prelimsData);
    });

    it('should return null for different tournament', () => {
      set('tournament-1', 'finals', [{ id: 1 }], 'etag1');

      const result = get('tournament-2', 'finals');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set cache entry with all required fields', () => {
      const mockData = [{ id: 1, rank: 1 }];
      const mockETag = 'etag123';

      set('tournament-1', 'finals', mockData, mockETag);

      const result = get('tournament-1', 'finals');

      expect(result).not.toBeNull();
      expect(result?.data).toEqual(mockData);
      expect(result?.etag).toBe(mockETag);
      expect(result?.lastUpdated).toBeDefined();
    });

    it('should generate ISO string timestamp', () => {
      const mockData = [{ id: 1 }];

      set('tournament-1', 'finals', mockData, 'etag1');

      const result = get('tournament-1', 'finals');

      expect(result?.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should overwrite existing cache entry', () => {
      const mockData1 = [{ id: 1 }];
      const mockData2 = [{ id: 2 }];

      set('tournament-1', 'finals', mockData1, 'etag1');
      set('tournament-1', 'finals', mockData2, 'etag2');

      const result = get('tournament-1', 'finals');

      expect(result?.data).toEqual(mockData2);
      expect(result?.etag).toBe('etag2');
    });

    it('should handle empty data array', () => {
      const mockData: unknown[] = [];

      set('tournament-1', 'finals', mockData, 'etag1');

      const result = get('tournament-1', 'finals');

      expect(result?.data).toEqual([]);
    });

    it('should handle complex data structures', () => {
      const mockData = [
        {
          id: 1,
          player: { name: 'Player 1', character: 'Mario' },
          stats: { wins: 5, losses: 2, points: 15 },
        },
      ];

      set('tournament-1', 'finals', mockData, 'etag1');

      const result = get('tournament-1', 'finals');

      expect(result?.data).toEqual(mockData);
    });
  });

  describe('generateETag', () => {
    it('should generate hash for simple array', () => {
      const data = [{ id: 1, name: 'Test' }];

      const etag = generateETag(data);

      expect(etag).toBeDefined();
      expect(typeof etag).toBe('string');
    });

    it('should generate same hash for same data', () => {
      const data = [{ id: 1, name: 'Test' }];

      const etag1 = generateETag(data);
      const etag2 = generateETag(data);

      expect(etag1).toBe(etag2);
    });

    it('should generate different hash for different data', () => {
      const data1 = [{ id: 1, name: 'Test' }];
      const data2 = [{ id: 2, name: 'Different' }];

      const etag1 = generateETag(data1);
      const etag2 = generateETag(data2);

      expect(etag1).not.toBe(etag2);
    });

    it('should handle empty array', () => {
      const data: unknown[] = [];

      const etag = generateETag(data);

      expect(etag).toBeDefined();
      expect(typeof etag).toBe('string');
    });

    it('should handle nested objects', () => {
      const data = [
        {
          player: { name: 'Test', team: 'Team A' },
          scores: [10, 15, 20],
        },
      ];

      const etag = generateETag(data);

      expect(etag).toBeDefined();
    });

    it('should produce hexadecimal string', () => {
      const data = [{ id: 1 }];

      const etag = generateETag(data);

      expect(etag).toMatch(/^[0-9a-f-]+$/);
    });

    it('should handle special characters in data', () => {
      const data = [{ name: 'テスト', emoji: '🎮' }];

      const etag = generateETag(data);

      expect(etag).toBeDefined();
      expect(typeof etag).toBe('string');
    });
  });

  describe('isExpired', () => {
    it('should return false for fresh cache entry', () => {
      const cacheEntry: CachedStandings = {
        data: [{ id: 1 }],
        lastUpdated: new Date().toISOString(),
        etag: 'etag1',
      };

      const result = isExpired(cacheEntry);

      expect(result).toBe(false);
    });

    it('should return true for expired cache entry', () => {
      const expiredDate = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago

      const cacheEntry: CachedStandings = {
        data: [{ id: 1 }],
        lastUpdated: expiredDate.toISOString(),
        etag: 'etag1',
      };

      const result = isExpired(cacheEntry);

      expect(result).toBe(true);
    });

    it('should handle boundary case (exactly TTL)', () => {
      const boundaryDate = new Date(Date.now() - 5 * 60 * 1000 - 100); // Slightly more than 5 minutes ago

      const cacheEntry: CachedStandings = {
        data: [{ id: 1 }],
        lastUpdated: boundaryDate.toISOString(),
        etag: 'etag1',
      };

      const result = isExpired(cacheEntry);

      expect(result).toBe(true);
    });

    it('should handle various ISO date formats', () => {
      const cacheEntry: CachedStandings = {
        data: [{ id: 1 }],
        lastUpdated: '2024-01-21T12:00:00.000Z',
        etag: 'etag1',
      };

      const result = isExpired(cacheEntry);

      expect(typeof result).toBe('boolean');
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific tournament stage', () => {
      set('tournament-1', 'finals', [{ id: 1 }], 'etag1');
      set('tournament-1', 'prelims', [{ id: 2 }], 'etag2');
      set('tournament-2', 'finals', [{ id: 3 }], 'etag3');

      invalidate('tournament-1', 'finals');

      expect(get('tournament-1', 'finals')).toBeNull();
      expect(get('tournament-1', 'prelims')).not.toBeNull();
      expect(get('tournament-2', 'finals')).not.toBeNull();
    });

    it('should invalidate all stages for tournament when stage not provided', () => {
      set('tournament-1', 'finals', [{ id: 1 }], 'etag1');
      set('tournament-1', 'prelims', [{ id: 2 }], 'etag2');
      set('tournament-1', 'semifinals', [{ id: 3 }], 'etag3');
      set('tournament-2', 'finals', [{ id: 4 }], 'etag4');

      invalidate('tournament-1');

      expect(get('tournament-1', 'finals')).toBeNull();
      expect(get('tournament-1', 'prelims')).toBeNull();
      expect(get('tournament-1', 'semifinals')).toBeNull();
      expect(get('tournament-2', 'finals')).not.toBeNull();
    });

    it('should handle invalidating non-existent key', () => {
      expect(() => {
        invalidate('tournament-999', 'finals');
      }).not.toThrow();
    });

    it('should handle tournament with hyphen in name', () => {
      set('tournament-1-2024', 'finals', [{ id: 1 }], 'etag1');

      invalidate('tournament-1-2024', 'finals');

      expect(get('tournament-1-2024', 'finals')).toBeNull();
    });

    it('should handle special characters in tournament ID', () => {
      set('tournament-abc-123', 'finals', [{ id: 1 }], 'etag1');

      invalidate('tournament-abc-123', 'finals');

      expect(get('tournament-abc-123', 'finals')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      set('tournament-1', 'finals', [{ id: 1 }], 'etag1');
      set('tournament-1', 'prelims', [{ id: 2 }], 'etag2');
      set('tournament-2', 'finals', [{ id: 3 }], 'etag3');
      set('tournament-3', 'finals', [{ id: 4 }], 'etag4');

      clear();

      expect(get('tournament-1', 'finals')).toBeNull();
      expect(get('tournament-1', 'prelims')).toBeNull();
      expect(get('tournament-2', 'finals')).toBeNull();
      expect(get('tournament-3', 'finals')).toBeNull();
    });

    it('should handle clearing empty cache', () => {
      expect(() => {
        clear();
      }).not.toThrow();
    });

    it('should allow adding data after clearing', () => {
      set('tournament-1', 'finals', [{ id: 1 }], 'etag1');

      clear();

      set('tournament-2', 'finals', [{ id: 2 }], 'etag2');

      expect(get('tournament-2', 'finals')).not.toBeNull();
    });
  });

  describe('integration tests', () => {
    it('should handle full cache lifecycle', () => {
      const mockData = [{ id: 1, rank: 1 }];

      set('tournament-1', 'finals', mockData, 'etag1');
      const retrieved = get('tournament-1', 'finals');
      expect(retrieved?.data).toEqual(mockData);

      invalidate('tournament-1', 'finals');
      expect(get('tournament-1', 'finals')).toBeNull();
    });

    it('should handle multiple tournaments independently', () => {
      const data1 = [{ id: 1 }];
      const data2 = [{ id: 2 }];

      set('tournament-1', 'finals', data1, 'etag1');
      set('tournament-2', 'finals', data2, 'etag2');

      expect(get('tournament-1', 'finals')?.data).toEqual(data1);
      expect(get('tournament-2', 'finals')?.data).toEqual(data2);

      invalidate('tournament-1');

      expect(get('tournament-1', 'finals')).toBeNull();
      expect(get('tournament-2', 'finals')?.data).toEqual(data2);
    });

    it('should generate different ETags for different data', () => {
      const data1 = [{ id: 1, rank: 1 }];
      const data2 = [{ id: 2, rank: 2 }];

      const etag1 = generateETag(data1);
      const etag2 = generateETag(data2);

      expect(etag1).not.toBe(etag2);
    });

    it('should handle cache update with same key', () => {
      const data1 = [{ id: 1 }];
      const data2 = [{ id: 2 }];

      set('tournament-1', 'finals', data1, 'etag1');
      set('tournament-1', 'finals', data2, 'etag2');

      const retrieved = get('tournament-1', 'finals');

      expect(retrieved?.data).toEqual(data2);
      expect(retrieved?.etag).toBe('etag2');
    });

    it('should invalidate all tournament stages correctly', () => {
      set('tournament-1', 'finals', [{ id: 1 }], 'etag1');
      set('tournament-1', 'prelims', [{ id: 2 }], 'etag2');
      set('tournament-1', 'semifinals', [{ id: 3 }], 'etag3');

      invalidate('tournament-1');

      expect(get('tournament-1', 'finals')).toBeNull();
      expect(get('tournament-1', 'prelims')).toBeNull();
      expect(get('tournament-1', 'semifinals')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle very large data arrays', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      const etag = generateETag(largeData);

      expect(etag).toBeDefined();
      expect(typeof etag).toBe('string');
    });

    it('should handle deeply nested data structures', () => {
      const nestedData = [
        {
          id: 1,
          nested: {
            deeply: {
              nested: {
                value: 123,
              },
            },
          },
        },
      ];

      set('tournament-1', 'finals', nestedData, 'etag1');

      const result = get('tournament-1', 'finals');

      expect(result?.data).toEqual(nestedData);
    });

    it('should handle null values in data array', () => {
      const dataWithNull = [{ id: 1 }, null, { id: 2 } as unknown];

      set('tournament-1', 'finals', dataWithNull, 'etag1');

      const result = get('tournament-1', 'finals');

      expect(result?.data).toEqual(dataWithNull);
    });

    it('should handle numeric strings in tournament ID', () => {
      set('123', 'finals', [{ id: 1 }], 'etag1');

      const result = get('123', 'finals');

      expect(result?.data).toEqual([{ id: 1 }]);
    });

    it('should handle empty stage name', () => {
      set('tournament-1', '', [{ id: 1 }], 'etag1');

      const result = get('tournament-1', '');

      expect(result?.data).toEqual([{ id: 1 }]);
    });
  });
});
