-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "token" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);
