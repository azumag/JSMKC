-- Add per-mode qualification confirmed flags to Tournament.
-- Previously a single qualificationConfirmed flag covered all modes (BM/MR/GP),
-- causing one mode's confirmation to lock all other modes' scores (issue #696).
-- Each mode now has its own flag so confirmations are independent.
-- Existing qualificationConfirmed=1 rows have all three per-mode flags set to 1
-- since we cannot retroactively know which mode was originally confirmed.
ALTER TABLE "Tournament" ADD COLUMN "bmQualificationConfirmed" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Tournament" ADD COLUMN "mrQualificationConfirmed" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Tournament" ADD COLUMN "gpQualificationConfirmed" BOOLEAN NOT NULL DEFAULT 0;
UPDATE "Tournament" SET
  "bmQualificationConfirmed" = "qualificationConfirmed",
  "mrQualificationConfirmed" = "qualificationConfirmed",
  "gpQualificationConfirmed" = "qualificationConfirmed"
WHERE "qualificationConfirmed" = 1;
