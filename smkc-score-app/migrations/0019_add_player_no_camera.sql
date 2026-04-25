-- Migration: Add noCamera flag to Player
-- Mirrors prisma/migrations/0005_player_no_camera (Prisma CLI is local-only;
-- this wrangler-format file is the one D1 production actually applies).
-- Boolean stored as INTEGER per SQLite convention; Prisma D1 adapter handles
-- the 0/1 ↔ false/true conversion.
ALTER TABLE "Player" ADD COLUMN "noCamera" INTEGER NOT NULL DEFAULT 0;
