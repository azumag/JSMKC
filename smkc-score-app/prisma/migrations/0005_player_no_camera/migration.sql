-- Add noCamera column to Player table.
-- Existing players default to false (camera available).
ALTER TABLE "Player" ADD COLUMN "noCamera" BOOLEAN NOT NULL DEFAULT false;
