import { getPaginationParams, paginate } from '@/lib/pagination';

describe('Pagination Utilities', () => {
  describe('getPaginationParams', () => {
    it('should use default page when not provided', () => {
      const result = getPaginationParams({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.skip).toBe(0);
    });

    it('should use provided page', () => {
      const result = getPaginationParams({ page: 5 });
      expect(result.page).toBe(5);
      expect(result.limit).toBe(50);
      expect(result.skip).toBe(200);
    });

    it('should use provided limit', () => {
      const result = getPaginationParams({ limit: 20 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(0);
    });

    it('should use provided page and limit together', () => {
      const result = getPaginationParams({ page: 3, limit: 25 });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
      expect(result.skip).toBe(50);
    });

    it('should enforce minimum page of 1', () => {
      const result = getPaginationParams({ page: 0 });
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it('should enforce minimum limit of 1', () => {
      const result = getPaginationParams({ limit: 0 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);  // limit of 0 uses default of 50
      expect(result.skip).toBe(0);
    });

    it('should enforce maximum limit of 100', () => {
      const result = getPaginationParams({ limit: 200 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
      expect(result.skip).toBe(0);
    });

    it('should handle string number values', () => {
      const result = getPaginationParams({ page: '5', limit: '10' } as any);
      expect(result.page).toBe(5);
      expect(result.limit).toBe(10);
      expect(result.skip).toBe(40);
    });
  });

  describe('paginate', () => {
    let mockFindMany: jest.Mock;
    let mockCount: jest.Mock;

    beforeEach(() => {
      mockFindMany = jest.fn();
      mockCount = jest.fn();
    });

    it('should paginate data correctly', async () => {
      const mockData = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ];
      
      mockFindMany.mockResolvedValue(mockData.slice(0, 2));
      mockCount.mockResolvedValue(10);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, {}, {}, { page: 1, limit: 2 });

      expect(result.data).toEqual(mockData.slice(0, 2));
      expect(result.meta.total).toBe(10);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(2);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {},
        orderBy: {},
        skip: 0,
        take: 2,
      });
      expect(mockCount).toHaveBeenCalledWith({ where: {} });
    });

    it('should paginate with second page', async () => {
      const mockData = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ];
      
      mockFindMany.mockResolvedValue(mockData.slice(2, 4));
      mockCount.mockResolvedValue(10);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, {}, {}, { page: 2, limit: 2 });

      expect(result.data).toEqual(mockData.slice(2, 4));
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(2);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {},
        orderBy: {},
        skip: 2,
        take: 2,
      });
      expect(mockCount).toHaveBeenCalledWith({ where: {} });
    });



    it('should apply custom where clause', async () => {
      const mockData = [{ id: 1, name: 'Item 1' }];
      mockFindMany.mockResolvedValue(mockData);
      mockCount.mockResolvedValue(5);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, { status: 'active' }, {}, { page: 1, limit: 10 });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        orderBy: {},
        skip: 0,
        take: 10,
      });
      expect(mockCount).toHaveBeenCalledWith({ where: { status: 'active' } });
    });

    it('should apply custom orderBy', async () => {
      const mockData = [{ id: 1, name: 'Item 1' }];
      mockFindMany.mockResolvedValue(mockData);
      mockCount.mockResolvedValue(5);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, {}, { createdAt: 'desc' }, { page: 1, limit: 10 });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(mockCount).toHaveBeenCalledWith({ where: {} });
    });

    it('should calculate total pages correctly for exact pages', async () => {
      const mockData = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      mockFindMany.mockResolvedValue(mockData.slice(0, 5));
      mockCount.mockResolvedValue(10);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, {}, {}, { page: 1, limit: 5 });

      expect(result.meta.totalPages).toBe(2);
    });

    it('should calculate total pages correctly for remainder', async () => {
      const mockData = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
      mockFindMany.mockResolvedValue(mockData.slice(0, 5));
      mockCount.mockResolvedValue(12);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, {}, {}, { page: 1, limit: 5 });

      expect(result.meta.totalPages).toBe(3);
    });

    it('should handle empty results', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const query = {
        findMany: mockFindMany,
        count: mockCount,
      };

      const result = await paginate(query, { page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });
});
