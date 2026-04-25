-- Add tvNumber to TTPhaseRound for broadcast TV assignment.
-- Existing rounds default to NULL (no TV assigned).
ALTER TABLE "TTPhaseRound" ADD COLUMN "tvNumber" INTEGER;
