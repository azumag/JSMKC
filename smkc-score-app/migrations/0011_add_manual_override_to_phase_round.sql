-- Migration: Add manualOverride column to TTPhaseRound
-- This column tracks whether an admin manually specified the course for a round,
-- as opposed to the default random selection from the 20-course cycle pool.
-- Used for audit trail display in the round history UI.

ALTER TABLE "TTPhaseRound" ADD COLUMN "manualOverride" BOOLEAN NOT NULL DEFAULT false;
