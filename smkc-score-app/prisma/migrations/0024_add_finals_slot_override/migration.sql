-- AlterTable
ALTER TABLE "BMMatch" ADD COLUMN "slotOverrideBy" TEXT;
ALTER TABLE "BMMatch" ADD COLUMN "slotOverrideAt" DATETIME;

-- AlterTable
ALTER TABLE "MRMatch" ADD COLUMN "slotOverrideBy" TEXT;
ALTER TABLE "MRMatch" ADD COLUMN "slotOverrideAt" DATETIME;

-- AlterTable
ALTER TABLE "GPMatch" ADD COLUMN "slotOverrideBy" TEXT;
ALTER TABLE "GPMatch" ADD COLUMN "slotOverrideAt" DATETIME;
