-- Persist why a sudden-death round was run instead of inferring it from
-- course equality with the base round (issue #2775). Only the life_loss
-- vs. non-life_loss distinction affects existing logic (course-pool
-- accounting, the "re-run base course" guard), so the backfill only
-- distinguishes those two cases; older revival/bronze rows fall back to
-- the "elimination" default, which is functionally equivalent for those
-- code paths (both draw a fresh course from the pool).
ALTER TABLE "TTPhaseSuddenDeathRound" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'elimination';

UPDATE "TTPhaseSuddenDeathRound"
SET "kind" = 'life_loss'
WHERE "phase" = 'phase3'
  AND "course" = (
    SELECT "course" FROM "TTPhaseRound" WHERE "TTPhaseRound"."id" = "TTPhaseSuddenDeathRound"."phaseRoundId"
  );
