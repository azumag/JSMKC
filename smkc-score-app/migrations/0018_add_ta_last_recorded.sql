-- Migration: Add lastRecordedCourse/lastRecordedTime to TTEntry
-- Used by the overlay to surface the specific (course, time) pair just entered,
-- since `times` is a JSON map without a per-course timestamp the overlay route
-- could derive "what was just added" from. Set by the TA PUT route on every
-- successful time write; nullable so existing rows remain valid.
ALTER TABLE "TTEntry" ADD COLUMN "lastRecordedCourse" TEXT;
ALTER TABLE "TTEntry" ADD COLUMN "lastRecordedTime" TEXT;
