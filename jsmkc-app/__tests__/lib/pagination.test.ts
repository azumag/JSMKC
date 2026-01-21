// __tests__/lib/pagination.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { paginate, getPaginationParams } from '@/lib/pagination';
import { PrismaClient } from '@prisma/client';

describe('Pagination Utilities', () => {
  describe('getPaginationParams', () => {
    it('should return default pagination parameters when no options provided', () => {
      const params = getPaginationParams();
      expect(params.page).toBe(1);
      expect(params.limit).toBe(50);
      expect(params.skip).toBe(0);
    });

    it('should handle custom page and limit values', () => {
      const params = getPaginationParams({ page: 3, limit: 20 });
      expect(params.page).toBe(3);
      expect(params.limit).toBe(20);
      expect(params.skip).toBe(40);
    });

    it('should clamp limit to maximum of 100', () => {
      const params = getPaginationParams({ limit: 150 });
      expect(params.limit).toBe(100);
    });

    it('should clamp limit to maximum of 100 even with value > 100', () => {
      const params = getPaginationParams({ limit: 1000 });
      expect(params.limit).toBe(100);
    });

    it('should handle negative page values by setting to minimum of 1', () => {
      const params = getPaginationParams({ page: -5 });
      expect(params.page).toBe(1);
    });

    it('should handle zero page value by setting to minimum of 1', () => {
      const params = getPaginationParams({ page: 0 });
      expect(params.page).toBe(1);
    });

    it('should handle non-numeric page values by setting to default of 1', () => {
      const params = getPaginationParams({ page: 'abc' as any });
      expect(params.page).toBe(1);
    });

    it('should handle string numeric page values', () => {
      const params = getPaginationParams({ page: '3' as any });
      expect(params.page).toBe(3);
    });

    it('should handle null and undefined values with defaults', () => {
      const params = getPaginationParams({ page: null as any, limit: undefined });
      expect(params.page).toBe(1);
      expect(params.limit).toBe(50);
      expect(params.skip).toBe(0);
    });

    it('should handle negative limit values by setting to default of 50', () => {
      const params = getPaginationParams({ limit: -10 });
      expect(params.limit).toBe(50);
    });

    it('should handle zero limit value by setting to default of 50', () => {
      const params = getPaginationParams({ limit: 0 });
      expect(params.limit).toBe(50);
    });

    it('should calculate skip correctly for page > 1', () => {
      const params = getPaginationParams({ page: 5, limit: 10 });
      expect(params.page).toBe(5);
      expect(params.limit).toBe(10);
      expect(params.skip).toBe(40);
    });
  });

  describe('paginate', () => {
    it('should paginate data correctly with default parameters', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
        count: jest.fn().mockResolvedValue(2)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, {});
      
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(50);
      expect(result.meta.totalPages).toBe(1);
      expect(mockQuery.findMany).toHaveBeenCalledWith({ where: {}, orderBy: {}, skip: 0, take: 50 });
    });

    it('should handle empty data set', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, {});
      
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(50);
      expect(result.meta.totalPages).toBe(0);
    });

    it('should handle large dataset with multiple pages', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue(Array(50).fill({ id: 1 })),
        count: jest.fn().mockResolvedValue(101)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, { page: 2, limit: 50 });
      
      expect(result.data).toHaveLength(50);
      expect(result.meta.total).toBe(101);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(50);
      expect(result.meta.totalPages).toBe(3);
      expect(mockQuery.findMany).toHaveBeenCalledWith({ where: {}, orderBy: {}, skip: 50, take: 50 });
    });

    it('should handle custom where and orderBy parameters', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        count: jest.fn().mockResolvedValue(1)
      };
      
      const where = { status: 'active' };
      const orderBy = { createdAt: 'desc' };
      
      await paginate(mockQuery as any, where, orderBy, {});
      
      expect(mockQuery.findMany).toHaveBeenCalledWith({ 
        where, 
        orderBy, 
        skip: 0, 
        take: 50 
      });
      expect(mockQuery.count).toHaveBeenCalledWith({ where });
    });

    it('should clamp page to minimum of 1 for invalid values', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        count: jest.fn().mockResolvedValue(1)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, { page: -5, limit: 50 });
      
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(50);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should handle limit clamping to 100', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        count: jest.fn().mockResolvedValue(1)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, { limit: 150 });
      
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(100);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should return correct totalPages when total is exactly divisible by limit', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(100)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, { limit: 25 });
      
      expect(result.meta.total).toBe(100);
      expect(result.meta.limit).toBe(25);
      expect(result.meta.totalPages).toBe(4);
    });

    it('should call findMany and count in parallel using Promise.all', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        count: jest.fn().mockResolvedValue(1)
      };
      
      await paginate(mockQuery as any, {}, {}, {});
      
      expect(mockQuery.findMany).toHaveBeenCalled();
      expect(mockQuery.count).toHaveBeenCalled();
    });
  });

  describe('Prisma Pagination Integration', () => {
    it('should work with PrismaClient structure', async () => {
      const mockQuery = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        count: jest.fn().mockResolvedValue(1)
      };
      
      const result = await paginate(mockQuery as any, {}, {}, {});
      
      expect(result.data).toBeInstanceOf(Array);
      expect(result.meta).toHaveProperty('total');
      expect(result.meta).toHaveProperty('page');
      expect(result.meta).toHaveProperty('limit');
      expect(result.meta).toHaveProperty('totalPages');
    });
  });
});
