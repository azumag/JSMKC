-- Cross-group sudden-death result used only after WDL score and point
-- differential are completely tied in the combined standings.
ALTER TABLE "BMQualification" ADD COLUMN "combinedRankOverride" INTEGER;
ALTER TABLE "BMQualification" ADD COLUMN "combinedRankOverrideBy" TEXT;
ALTER TABLE "BMQualification" ADD COLUMN "combinedRankOverrideAt" DATETIME;

ALTER TABLE "MRQualification" ADD COLUMN "combinedRankOverride" INTEGER;
ALTER TABLE "MRQualification" ADD COLUMN "combinedRankOverrideBy" TEXT;
ALTER TABLE "MRQualification" ADD COLUMN "combinedRankOverrideAt" DATETIME;

ALTER TABLE "GPQualification" ADD COLUMN "combinedRankOverride" INTEGER;
ALTER TABLE "GPQualification" ADD COLUMN "combinedRankOverrideBy" TEXT;
ALTER TABLE "GPQualification" ADD COLUMN "combinedRankOverrideAt" DATETIME;
