// Extended Prisma types for common patterns used across the application
// Provides type-safe interfaces for pagination and transactions

/** Paginated query result with metadata */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/** Pagination query parameters */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** Prisma transaction client type for use in transactional operations */
export type PrismaTransaction = Parameters<
  Parameters<import('@prisma/client').PrismaClient['$transaction']>[0]
>[0];

/** Generic model accessor for Prisma CRUD operations */
export interface ModelAccessor<T> {
  findUnique: (args: { where: Record<string, unknown> }) => Promise<T | null>;
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  create: (args: { data: Record<string, unknown> }) => Promise<T>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<T>;
  delete: (args: { where: Record<string, unknown> }) => Promise<T>;
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
}
