/**
 * Prisma Database Client with Cloudflare D1 Adapter
 *
 * Uses @prisma/adapter-d1 to connect to Cloudflare D1 (SQLite).
 * D1 is co-located with the Worker — no network hop, no WebSocket overhead.
 *
 * WeakMap caching: the D1Database binding object is unique per request context.
 * WeakMap<D1Database, PrismaClient> ensures we reuse the same client within a
 * single request, and let it be GC'd when the binding goes out of scope.
 *
 * Lazy Proxy: defers client creation until first property access so that
 * build-time module evaluation does not require a D1 binding.
 *
 * Usage:
 *   import prisma from '@/lib/prisma';
 *   const players = await prisma.player.findMany();
 */

import type { D1Database } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { recordQuery } from '@/lib/perf/query-counter';

// WeakMap: same D1 binding → same client (within request)
// different binding (new request) → new client
const clientCache = new WeakMap<D1Database, PrismaClient>();

/*
 * Per-request session cache for D1 Read Replication.
 *
 * `env.DB` is a fresh binding instance per Worker invocation, so storing
 * the resulting session on a WeakMap keyed by that binding gives us a
 * single session per request without any explicit teardown — the binding
 * (and therefore the session) is GC'd when the request finishes.
 *
 * `withSession()` is what tells D1 it can serve reads from a regional
 * replica while still routing writes to the primary and ensuring
 * "read-your-own-writes" within this Worker invocation. On runtimes
 * without read replication enabled (local `wrangler dev`, older
 * compatibility dates) the method is undefined, in which case we fall
 * back to the primary binding so the rest of the code path is unchanged.
 *
 * The Prisma client cache is keyed by the *session* binding, not the raw
 * binding, so all queries in a request share one session-aware client.
 */
type SessionCapable = D1Database & {
  withSession?: (constraintOrBookmark?: string) => D1Database;
};
const sessionCache = new WeakMap<D1Database, D1Database>();

function getSessionDb(raw: D1Database): D1Database {
  const cached = sessionCache.get(raw);
  if (cached) return cached;
  const withSession = (raw as SessionCapable).withSession;
  const session = typeof withSession === 'function'
    ? withSession.call(raw)
    : raw;
  sessionCache.set(raw, session);
  return session;
}

/*
 * Performance instrumentation. When PERF_LOG=1, every Prisma operation is
 * wrapped via $extends so we can:
 *   1. Record per-query duration into the current request's AsyncLocalStorage
 *      scope (see perf/query-counter.ts), enabling per-request "db_query_count"
 *      summaries from the API timing wrapper.
 *   2. Emit a `slow_query` warn log when a single operation exceeds the
 *      `PERF_SLOW_QUERY_MS` threshold (default 100ms). This lets us spot
 *      outliers without drowning in per-query info logs.
 *
 * The Prisma `$on('query')` event is not available with the D1 adapter (it
 * relies on the underlying query engine), so the $extends route is the only
 * reliable place to hook in.
 */
const PERF_LOG = process.env.PERF_LOG === '1';
const SLOW_QUERY_THRESHOLD_MS = Number(process.env.PERF_SLOW_QUERY_MS ?? 100);
const perfLog = createLogger('prisma-perf');

function getOrCreateClient(): PrismaClient {
  const { env } = getCloudflareContext();
  const rawDb = env.DB as unknown as D1Database;
  const db = getSessionDb(rawDb);
  let client = clientCache.get(db);
  if (!client) {
    const adapter = new PrismaD1(db);
    const base = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      // Globally omit password from Player queries to prevent accidental leakage.
      // Auth code explicitly uses `omit: { password: false }` when it needs the hash.
      omit: { player: { password: true } },
    });

    client = (PERF_LOG
      ? base.$extends({
          name: 'perf-instrumentation',
          query: {
            $allOperations: async ({ model, operation, args, query }) => {
              const start = Date.now();
              try {
                return await query(args);
              } finally {
                const duration = Date.now() - start;
                recordQuery(duration);
                if (duration >= SLOW_QUERY_THRESHOLD_MS) {
                  perfLog.warn('slow_query', {
                    model: model ?? '(raw)',
                    operation,
                    duration_ms: duration,
                  });
                }
              }
            },
          },
        })
      : base) as unknown as PrismaClient;
    clientCache.set(db, client);
  }
  return client;
}

/**
 * Lazy Proxy export — defers PrismaClient creation until first property access.
 * This ensures build-time module evaluation does not require a D1 binding.
 * The underlying PrismaClient is cached per D1 binding via WeakMap.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getOrCreateClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
