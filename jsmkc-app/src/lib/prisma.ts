import { PrismaClient } from "@prisma/client";

// Singleton pattern: reuse PrismaClient across hot reloads in development
// In production, a single instance is created and reused
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
  });

export const prisma = prismaClient;

// Preserve client across hot reloads in development
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
