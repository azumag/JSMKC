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

// WeakMap: same D1 binding → same client (within request)
// different binding (new request) → new client
const clientCache = new WeakMap<D1Database, PrismaClient>();

function getOrCreateClient(): PrismaClient {
  const { env } = getCloudflareContext();
  const db = env.DB as unknown as D1Database;
  let client = clientCache.get(db);
  if (!client) {
    const adapter = new PrismaD1(db);
    client = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      // Globally omit password from Player queries to prevent accidental leakage.
      // Auth code explicitly uses `omit: { password: false }` when it needs the hash.
      omit: { player: { password: true } },
    }) as PrismaClient;
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
