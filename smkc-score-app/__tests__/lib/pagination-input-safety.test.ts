import { describe, expect, it, jest } from '@jest/globals';
import { getPaginationParams, paginate } from '@/lib/pagination';

describe('pagination input safety', () => {
  it.each([NaN, Infinity, -Infinity])('defaults non-finite page %p to the first page', (page) => {
    expect(getPaginationParams({ page })).toEqual({
      page: 1,
      limit: 50,
      skip: 0,
      include: undefined,
    });
  });

  it.each([NaN, Infinity, -Infinity])('defaults non-finite limit %p to 50', (limit) => {
    expect(getPaginationParams({ page: 2, limit })).toEqual({
      page: 2,
      limit: 50,
      skip: 50,
      include: undefined,
    });
  });

  it('preserves runtime compatibility for numeric strings', () => {
    expect(
      getPaginationParams({
        page: '3' as unknown as number,
        limit: '20' as unknown as number,
      })
    ).toEqual({
      page: 3,
      limit: 20,
      skip: 40,
      include: undefined,
    });
  });

  it('keeps the existing floor and clamp semantics for finite values', () => {
    expect(getPaginationParams({ page: 3.9, limit: 20.9 })).toEqual({
      page: 3,
      limit: 20,
      skip: 40,
      include: undefined,
    });
    expect(getPaginationParams({ page: -2.5, limit: 500 })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
      include: undefined,
    });
  });

  it('fails closed when a finite page would create an unsafe Prisma offset', () => {
    expect(getPaginationParams({ page: Number.MAX_VALUE, limit: 100 })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
      include: undefined,
    });
  });

  it('never forwards non-finite skip or take values to Prisma', async () => {
    const query = {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    };

    const result = await paginate(query, {}, {}, { page: Infinity, limit: Infinity });

    expect(query.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: {},
      skip: 0,
      take: 50,
    });
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
  });
});
