-- Migration: Move seeding from Player.ttSeeding to TTEntry.seeding
-- Rationale: Seeding is per-tournament, not per-player (consistent with BM/MR/GP pattern)
-- Note: SQLite/D1 does not support DROP COLUMN, so Player.ttSeeding column is left in DB
-- but removed from Prisma schema (ignored at application level).
ALTER TABLE "TTEntry" ADD COLUMN "seeding" INTEGER;
