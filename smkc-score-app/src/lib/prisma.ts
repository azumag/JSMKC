/**
 * Prisma Database Client Singleton with Neon Serverless Adapter
 *
 * Exports a single PrismaClient instance that is reused across the entire
 * application lifetime. The singleton pattern is critical because Next.js
 * hot-reloads server modules during development, and each reload would
 * otherwise create a new PrismaClient, quickly exhausting the database
 * connection pool.
 *
 * Uses @neondatabase/serverless + @prisma/adapter-neon to connect to Neon
 * PostgreSQL without the native query engine binary. This is required for
 * Cloudflare Workers where native Node.js addons cannot run.
 *
 * The workaround stores the client on `globalThis`, which survives hot
 * reloads. In production only one instance is ever created, so the global
 * variable trick is a no-op.
 *
 * Usage:
 *   import { prisma } from '@/lib/prisma';
 *   const players = await prisma.player.findMany();
 */

import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Create a PrismaClient using the Neon serverless adapter.
 *
 * The Neon serverless driver communicates over WebSocket/HTTP,
 * eliminating the need for Prisma's native query engine binary.
 * This makes it compatible with edge runtimes like Cloudflare Workers.
 */
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  // PrismaNeon v7+ takes PoolConfig directly (creates its own pool internally)
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

  // Explicit PrismaClient type annotation: the `omit` config option narrows the
  // generic type (PrismaClient<{omit:…}>) making it incompatible with bare
  // PrismaClient in 20+ function signatures across the codebase. Casting here
  // ensures all consumers receive the standard PrismaClient type. The omit
  // behaviour still works at runtime regardless of the TypeScript-level cast.
  return new PrismaClient({
    adapter,
    // Development: log queries for debugging; Production: errors only
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    // Global omit: exclude Player.password (bcrypt hash) from all query results
    // by default. This prevents accidental credential leakage across 34+ query
    // sites that use `include: { player: true }` or direct Player queries.
    // Authentication code that needs the hash must explicitly opt in with
    // `omit: { password: false }` (see src/lib/auth.ts).
    // Requires Prisma 5.16+; we run 6.19.2.
    omit: {
      player: {
        password: true,
      },
    },
  }) as PrismaClient;
}

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const prismaClient = createPrismaClient();

  // Preserve client across hot reloads in development
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prismaClient;
  }

  return prismaClient;
}

// Lazily create the Prisma client so build-time module evaluation does not
// require DATABASE_URL unless a request actually hits the database.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;

export default prisma;
