import { Prisma } from '@prisma/client';

/**
 * Extended types for Prisma queries with common patterns
 * This file provides type-safe alternatives to 'any' type assertions
 */

/**
 * Type for pagination result
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Type for pagination query parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Soft delete clause type
 * Adds deletedAt filtering to where clauses
 */
export type SoftDeleteClause<T> = {
  [K in keyof T]: T[K] | Prisma.Nullable<T[K]>;
} & {
  deletedAt?: Prisma.DateTimeFilter | null;
};

/**
 * Prisma transaction type for optimistic locking
 * Provides type-safe access to transaction models
 */
export type PrismaTransaction = Omit<Prisma.TransactionClient, '$transaction'>;

/**
 * Generic model accessor for optimistic locking
 * Allows accessing any Prisma model in a transaction
 */
export type ModelAccessor<T extends PrismaTransaction> = {
  [K in keyof T]: T[K];
};

/**
 * Type for data updates with soft delete
 * Used in soft delete middleware
 */
export type SoftDeleteUpdateData<T> = T & {
  deletedAt?: Date | null;
};

/**
 * Type for where clauses with soft delete
 * Used in soft delete middleware
 */
export type SoftDeleteWhere<T> = T & {
  deletedAt?: Prisma.DateTimeFilter | null;
};
