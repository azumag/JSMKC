import { describe, expect, it } from '@jest/globals';
import { getPaginationParams } from '../../__mocks__/lib/pagination';

describe('pagination manual mock', () => {
  it('fails unsafe page values closed like the runtime helper', () => {
    expect(getPaginationParams({ page: Number.MAX_SAFE_INTEGER + 1, limit: 1 })).toEqual({
      page: 1,
      limit: 1,
      skip: 0,
      include: undefined,
    });
  });

  it('preserves numeric-string compatibility for safe values', () => {
    expect(getPaginationParams({ page: '3', limit: '20' })).toEqual({
      page: 3,
      limit: 20,
      skip: 40,
      include: undefined,
    });
  });
});
