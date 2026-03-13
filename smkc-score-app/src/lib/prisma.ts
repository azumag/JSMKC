/**
 * Prisma Database Client with Neon Serverless Adapter
 *
 * Uses @neondatabase/serverless + @prisma/adapter-neon to connect to Neon
 * PostgreSQL without the native query engine binary. This is required for
 * Cloudflare Workers where native Node.js addons cannot run.
 *
 * Cloudflare Workers I/O isolation:
 * Workers prohibit sharing I/O objects (WebSockets) across request contexts.
 * PrismaNeon implements SqlDriverAdapterFactory: its connect() method creates
 * a fresh neon.Pool (and WebSocket) per query batch. This means the
 * PrismaClient itself is safe to cache on globalThis — only the adapter
 * factory is stored, not the connections. Each request gets its own Pool
 * through the factory's connect() call.
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
 *   factory for Cloudflare Workers compatibility (no native binary needed).
 *   PrismaNeon.connect() creates a new neon.Pool per query batch, so the
 *   factory itself is safe to cache across requests.
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

  // Direct Neon URL → use PrismaNeon adapter factory (required on Workers)
  if (isDirectPostgresUrl(process.env.DATABASE_URL)) {
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({ adapter, log: [...logLevel] }) as PrismaClient;
  }

  // Accelerate / prisma dev URL → plain PrismaClient (local development)
  return new PrismaClient({ log: [...logLevel] }) as PrismaClient;
}

/**
 * Get a PrismaClient instance, cached on globalThis.
 *
 * Safe on both Node.js and Workers because PrismaNeon is a
 * SqlDriverAdapterFactory — it creates fresh connections per query batch
 * via connect(), so no I/O objects are shared across requests.
 */
export function getPrismaClient(): PrismaClient {
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
 * The underlying PrismaClient is cached on globalThis and reused.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;

export default prisma;
