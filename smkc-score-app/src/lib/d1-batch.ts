import type { D1Database } from '@cloudflare/workers-types';
import { getD1SessionDatabase } from '@/lib/prisma';

/** Execute a D1 native batch. Unlike Prisma's D1 adapter transaction shim,
 * `D1Database.batch()` commits all statements atomically or rolls them all
 * back, which is required when a business mutation must have an audit row. */
export async function executeD1Batch(statements: Array<{ sql: string; values: unknown[] }>): Promise<number[]> {
  // Keep the batch and all subsequent Prisma reads on the request-scoped D1
  // session. Reading through raw env.DB here would permit a replica to return
  // the pre-write version immediately after a successful correction.
  const db = getD1SessionDatabase() as D1Database;
  const results = await db.batch(statements.map(({ sql, values }) => db.prepare(sql).bind(...values)));
  return results.map((result) => Number(result.meta.changes ?? 0));
}
