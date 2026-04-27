-- Add debugMode flag to Tournament.
-- When true, admins see "auto-fill qualification scores" buttons on each mode page (TT/BM/MR/GP).
-- Used for E2E testing on staging/production environments without polluting normal tournaments.
ALTER TABLE "Tournament" ADD COLUMN "debugMode" BOOLEAN NOT NULL DEFAULT 0;
