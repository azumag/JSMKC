-- Migration: Add tvNumber to TTPhaseRound for broadcast TV assignment
-- Mirrors prisma/migrations/0006_ta_phase_round_tv_number (Prisma CLI is
-- local-only; this wrangler-format file is the one D1 production actually
-- applies).
-- Existing rows default to NULL (no TV assigned).
ALTER TABLE "TTPhaseRound" ADD COLUMN "tvNumber" INTEGER;
