/**
 * Extended Prisma Type Definitions for Common Application Patterns
 *
 * Supplements the auto-generated Prisma types with reusable interfaces
 * that appear across many API routes and service functions:
 *
 * - PaginatedResult<T>: Generic wrapper for paginated API responses,
 *   carrying both the data array and pagination metadata.
 * - PaginationParams: Standard page/pageSize query parameters accepted
 *   by list endpoints.
 * - PrismaTransaction: Type-safe extraction of the transaction client
 *   passed into Prisma's $transaction() callback, so helper functions
 *   can declare it as a parameter type.
 * - ModelAccessor<T>: Generic CRUD interface abstracting any Prisma
 *   model delegate, useful for writing model-agnostic utilities.
 *
 * Usage:
 *   import type { PaginatedResult, PrismaTransaction } from '@/types/prisma-extended';
 */

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
