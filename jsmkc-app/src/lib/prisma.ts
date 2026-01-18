import { PrismaClient } from "@prisma/client";
import { getSoftDeleteManager } from "./prisma-middleware";

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

export const prisma = prismaClient;

// ソフトデリートマネージャーの初期化
export const softDelete = getSoftDeleteManager(prismaClient);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
