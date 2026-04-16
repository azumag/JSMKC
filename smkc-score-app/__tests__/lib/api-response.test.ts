import { describe, expect, it } from '@jest/globals';
import { extractArrayData, extractPaginationMeta } from '@/lib/api-response';

describe('extractArrayData', () => {
  it('returns a direct array unchanged', () => {
    expect(extractArrayData([{ id: '1' }])).toEqual([{ id: '1' }]);
  });

  it('extracts arrays from legacy paginated responses', () => {
    expect(extractArrayData({
      data: [{ id: '1' }],
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    })).toEqual([{ id: '1' }]);
  });

  it('extracts arrays from standardized paginated success responses', () => {
    expect(extractArrayData({
      success: true,
      data: {
        data: [{ id: '1' }],
        meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
      },
    })).toEqual([{ id: '1' }]);
  });

  it('falls back to an empty array for non-array payloads', () => {
    expect(extractArrayData({ success: true, data: { id: '1' } })).toEqual([]);
    expect(extractArrayData(null)).toEqual([]);
  });
});

describe('extractPaginationMeta', () => {
  const meta = { total: 125, page: 1, limit: 50, totalPages: 3 };

  it('extracts metadata from legacy paginated responses', () => {
    expect(extractPaginationMeta({
      data: [{ id: '1' }],
      meta,
    })).toEqual(meta);
  });

  it('extracts metadata from standardized paginated success responses', () => {
    expect(extractPaginationMeta({
      success: true,
      data: {
        data: [{ id: '1' }],
        meta,
      },
    })).toEqual(meta);
  });

  it('falls back to null when pagination metadata is missing', () => {
    expect(extractPaginationMeta([{ id: '1' }])).toBeNull();
    expect(extractPaginationMeta({ success: true, data: [{ id: '1' }] })).toBeNull();
  });
});
