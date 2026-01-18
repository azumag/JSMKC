import { PrismaClient } from "@prisma/client";
import { createSoftDeleteMiddleware } from "./soft-delete";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// Apply soft delete middleware if $use method is available
if ('$use' in prismaClient && typeof prismaClient.$use === 'function') {
  prismaClient.$use(createSoftDeleteMiddleware());
  console.log('✅ Soft delete middleware applied');
} else {
  console.warn('⚠️ Prisma middleware not available, soft delete will not be automatic');
}

export const prisma = prismaClient;
export { SoftDeleteUtils } from './soft-delete';

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
