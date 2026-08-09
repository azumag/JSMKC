-- Phase 3 participant-reported times (issue #2994), separate from confirmed results
ALTER TABLE "TTPhaseRound" ADD COLUMN "reportedResults" TEXT;
-- Participant time-report feature toggle (default off)
ALTER TABLE "Tournament" ADD COLUMN "taPlayerReportEnabled" BOOLEAN NOT NULL DEFAULT false;
