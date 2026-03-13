/**
 * Prisma Database Client with Neon Serverless Adapter
 *
 * Uses @neondatabase/serverless + @prisma/adapter-neon to connect to Neon
 * PostgreSQL without the native query engine binary. This is required for
 * Cloudflare Workers where native Node.js addons cannot run.
 *
 * IMPORTANT — Cloudflare Workers I/O isolation:
 * Workers prohibit sharing I/O objects (WebSockets, streams) across request
 * contexts. PrismaNeon creates an internal connection pool backed by
 * WebSockets; if we cache a PrismaClient on globalThis, a second request
 * that reuses the cached client will hit:
 *   "Cannot perform I/O on behalf of a different request"
 * and the Worker crashes with a 500.
 *
 * Strategy:
 * - Development (Node.js): cache on globalThis to survive hot-reloads and
 *   avoid exhausting the connection pool.
 * - Production (Workers): create a fresh PrismaClient per request. This is
 *   lightweight because the WASM query engine is already loaded in memory
 *   and Neon's serverless driver is designed for short-lived connections.
 *
 * Usage:
 *   import prisma from '@/lib/prisma';
 *   const players = await prisma.player.findMany();
 */

import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Detect Cloudflare Workers runtime.
 * `navigator.userAgent` is "Cloudflare-Workers" in workerd, and the global
 * `caches` object with `default` property is Workers-specific.
 */
const isWorkersRuntime =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

/**
 * Check whether DATABASE_URL is a direct postgres:// connection string.
 * `prisma dev` provides a `prisma+postgres://` Accelerate URL which is
 * incompatible with driver adapters. In that case we create a plain
 * PrismaClient and let Prisma's built-in engine handle the connection.
 */
function isDirectPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/**
 * Create a PrismaClient.
 *
 * - Direct postgres:// URL (Neon / production): uses PrismaNeon adapter
 *   for Cloudflare Workers compatibility (no native binary needed).
 * - Accelerate / prisma+postgres:// URL (local `prisma dev`): uses plain
 *   PrismaClient with Prisma's built-in query engine.
 */
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const logLevel =
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn'] as const
      : ['error'] as const;

  // Direct Neon URL → use PrismaNeon adapter (required on Workers)
  if (isDirectPostgresUrl(process.env.DATABASE_URL)) {
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({ adapter, log: [...logLevel] }) as PrismaClient;
  }

  // Accelerate / prisma dev URL → plain PrismaClient (local development)
  return new PrismaClient({ log: [...logLevel] }) as PrismaClient;
}

/**
 * Get a PrismaClient instance.
 *
 * On Workers: always creates a new client to avoid cross-request I/O errors.
 * On Node.js (dev): caches on globalThis to survive hot-reloads.
 */
export function getPrismaClient(): PrismaClient {
  // Workers: never cache — each request needs its own I/O context
  if (isWorkersRuntime) {
    return createPrismaClient();
  }

  // Node.js (development): reuse cached client across hot-reloads
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Lazy Proxy export — defers PrismaClient creation until first property access.
 * This ensures build-time module evaluation does not require DATABASE_URL.
 *
 * On Workers, each property access creates a fresh client per request.
 * On Node.js, the cached globalThis client is reused.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;

export default prisma;
