import { describe, expect, it } from '@jest/globals';
import { extractArrayData } from '@/lib/api-response';

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
