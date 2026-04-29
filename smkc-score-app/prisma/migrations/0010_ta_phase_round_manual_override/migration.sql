-- Add manualOverride to TTPhaseRound.
-- The TA finals start_round flow writes this flag when creating a round.
ALTER TABLE "TTPhaseRound" ADD COLUMN "manualOverride" BOOLEAN NOT NULL DEFAULT false;
