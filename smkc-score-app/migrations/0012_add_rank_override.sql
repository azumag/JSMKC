-- Migration: Add rankOverride fields to BM/MR/GP qualification tables
-- These fields allow admins to manually override the automatic rank calculation
-- for emergency situations (player withdrawal, equipment failure, etc.).
-- rankOverrideBy and rankOverrideAt provide an audit trail for any overrides.

ALTER TABLE "BMQualification" ADD COLUMN "rankOverride" INTEGER;
ALTER TABLE "BMQualification" ADD COLUMN "rankOverrideBy" TEXT;
ALTER TABLE "BMQualification" ADD COLUMN "rankOverrideAt" DATETIME;

ALTER TABLE "MRQualification" ADD COLUMN "rankOverride" INTEGER;
ALTER TABLE "MRQualification" ADD COLUMN "rankOverrideBy" TEXT;
ALTER TABLE "MRQualification" ADD COLUMN "rankOverrideAt" DATETIME;

ALTER TABLE "GPQualification" ADD COLUMN "rankOverride" INTEGER;
ALTER TABLE "GPQualification" ADD COLUMN "rankOverrideBy" TEXT;
ALTER TABLE "GPQualification" ADD COLUMN "rankOverrideAt" DATETIME;
