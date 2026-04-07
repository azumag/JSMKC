-- Migration: Add ttSeeding field to Player table
-- §3.1: Used to auto-assign balanced pairs for TA qualification round
ALTER TABLE "Player" ADD COLUMN "ttSeeding" INTEGER;
