/**
 * Prisma Database Client Singleton
 *
 * Exports a single PrismaClient instance that is reused across the entire
 * application lifetime. The singleton pattern is critical because Next.js
 * hot-reloads server modules during development, and each reload would
 * otherwise create a new PrismaClient, quickly exhausting the database
 * connection pool.
 *
 * The workaround stores the client on `globalThis`, which survives hot
 * reloads. In production only one instance is ever created, so the global
 * variable trick is a no-op.
 *
 * Query logging is enabled in development for debugging; only errors are
 * logged in production to keep output clean.
 *
 * Usage:
 *   import { prisma } from '@/lib/prisma';
 *   const players = await prisma.player.findMany();
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Development: log queries for debugging; Production: errors only
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
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
  });

export const prisma = prismaClient;

// Preserve client across hot reloads in development
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
