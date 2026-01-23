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
  
  const limit = Number(options.limit);
  const finalLimit = limit && limit > 0 
    ? Math.min(100, limit) 
    : 50;
  
  return {
    page,
    limit: finalLimit,
    skip: (page - 1) * finalLimit,
  };
}

// Prisma's function signatures are too complex to type accurately in a generic way.
// Using 'any' here is acceptable because the pagination function is
// type-safe at the call site where specific Prisma methods are passed.
export async function paginate<T>(
  query: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: (...args: any[]) => Promise<T[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count: (...args: any[]) => Promise<number>;
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
