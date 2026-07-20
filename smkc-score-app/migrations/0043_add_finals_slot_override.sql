-- Migration: Add manual slot placement adjustment audit fields to BM/MR/GP match tables
-- Allows admins to swap/assign bracket slot players after generation without
-- losing recorded scores (CDM emergency correction, issue #3017).
-- slotOverrideBy/slotOverrideAt record who/when adjusted a slot; cleared when
-- automatic bracket advancement subsequently overwrites the slot.

ALTER TABLE "BMMatch" ADD COLUMN "slotOverrideBy" TEXT;
ALTER TABLE "BMMatch" ADD COLUMN "slotOverrideAt" DATETIME;

ALTER TABLE "MRMatch" ADD COLUMN "slotOverrideBy" TEXT;
ALTER TABLE "MRMatch" ADD COLUMN "slotOverrideAt" DATETIME;

ALTER TABLE "GPMatch" ADD COLUMN "slotOverrideBy" TEXT;
ALTER TABLE "GPMatch" ADD COLUMN "slotOverrideAt" DATETIME;
