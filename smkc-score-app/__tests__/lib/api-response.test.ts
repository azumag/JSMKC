import { describe, expect, it } from '@jest/globals';
import { extractArrayData, extractPaginationMeta } from '@/lib/api-response';

describe('extractArrayData', () => {
  it('returns a direct array unchanged', () => {
    expect(extractArrayData([{ id: '1' }])).toEqual([{ id: '1' }]);
  });

  it('extracts arrays from legacy paginated responses', () => {
    expect(
      extractArrayData({
        data: [{ id: '1' }],
        meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
      }),
    ).toEqual([{ id: '1' }]);
  });

  it('extracts arrays from standardized paginated success responses', () => {
    expect(
      extractArrayData({
        success: true,
        data: {
          data: [{ id: '1' }],
          meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
        },
      }),
    ).toEqual([{ id: '1' }]);
  });

  it('falls back to an empty array for non-array payloads', () => {
    expect(extractArrayData({ success: true, data: { id: '1' } })).toEqual([]);
    expect(extractArrayData(null)).toEqual([]);
  });
});

describe('extractPaginationMeta', () => {
  const meta = { total: 125, page: 1, limit: 50, totalPages: 3 };

  it('extracts metadata from legacy paginated responses', () => {
    expect(
      extractPaginationMeta({
        data: [{ id: '1' }],
        meta,
      }),
    ).toEqual(meta);
  });

  it('extracts metadata from standardized paginated success responses', () => {
    expect(
      extractPaginationMeta({
        success: true,
        data: {
          data: [{ id: '1' }],
          meta,
        },
      }),
    ).toEqual(meta);
  });

  it('falls back to null when pagination metadata is missing', () => {
    expect(extractPaginationMeta([{ id: '1' }])).toBeNull();
    expect(extractPaginationMeta({ success: true, data: [{ id: '1' }] })).toBeNull();
  });

  it.each([
    { ...meta, total: -1 },
    { ...meta, total: 1.5 },
    { ...meta, page: 0 },
    { ...meta, page: -1 },
    { ...meta, page: 1.5 },
    { ...meta, limit: 0 },
    { ...meta, limit: 1.5 },
    { ...meta, totalPages: 0 },
    { ...meta, totalPages: 1.5 },
  ])('rejects invalid numeric pagination metadata: %p', (invalidMeta) => {
    expect(extractPaginationMeta({ data: [], meta: invalidMeta })).toBeNull();
    expect(extractPaginationMeta({ success: true, data: { data: [], meta: invalidMeta } })).toBeNull();
  });

  it.each([
    { ...meta, totalPages: 2 },
    { ...meta, totalPages: 4 },
    { total: 0, page: 1, limit: 50, totalPages: 2 },
  ])('rejects pagination metadata whose totalPages conflicts with total and limit: %p', (invalidMeta) => {
    expect(extractPaginationMeta({ data: [], meta: invalidMeta })).toBeNull();
    expect(extractPaginationMeta({ success: true, data: { data: [], meta: invalidMeta } })).toBeNull();
  });

  it('accepts totalPages=1 for an empty result set', () => {
    const emptyMeta = { total: 0, page: 1, limit: 50, totalPages: 1 };

    expect(extractPaginationMeta({ data: [], meta: emptyMeta })).toEqual(emptyMeta);
    expect(extractPaginationMeta({ success: true, data: { data: [], meta: emptyMeta } })).toEqual(emptyMeta);
  });

  it('accepts an out-of-range page so callers can clamp to the server-reported last page', () => {
    const outOfRangePage = { total: 1, page: 3, limit: 50, totalPages: 1 };

    expect(extractPaginationMeta({ data: [], meta: outOfRangePage })).toEqual(outOfRangePage);
  });
});
