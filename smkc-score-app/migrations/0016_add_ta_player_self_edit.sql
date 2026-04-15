-- Migration: Add taPlayerSelfEdit to Tournament
-- §3.1: When false, players cannot edit their own TA qualification times (only partner's)
-- Default true for backward compatibility with existing tournaments
ALTER TABLE "Tournament" ADD COLUMN "taPlayerSelfEdit" BOOLEAN NOT NULL DEFAULT 1;
