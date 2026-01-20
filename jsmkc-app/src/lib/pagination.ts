export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export function getPaginationParams(options: PaginationOptions = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
  
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export async function paginate<T>(
  query: {
    findMany: any;
    count: any;
  },
  where: Record<string, unknown> = {},
  orderBy: Record<string, unknown> = {},
  options: PaginationOptions = {}
): Promise<PaginatedResponse<T>> {
  const { page, limit, skip } = getPaginationParams(options);

  const [data, total] = await Promise.all([
    query.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    }),
    query.count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
