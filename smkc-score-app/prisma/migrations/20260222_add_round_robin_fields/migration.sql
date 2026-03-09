-- Add round-robin scheduling fields to match models
-- roundNumber: Day number from circle-method schedule (1-based)
-- isBye: BREAK match (walkover/forfeit with fixed score)

ALTER TABLE "BMMatch" ADD COLUMN "roundNumber" INTEGER;
ALTER TABLE "BMMatch" ADD COLUMN "isBye" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MRMatch" ADD COLUMN "roundNumber" INTEGER;
ALTER TABLE "MRMatch" ADD COLUMN "isBye" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GPMatch" ADD COLUMN "roundNumber" INTEGER;
ALTER TABLE "GPMatch" ADD COLUMN "isBye" BOOLEAN NOT NULL DEFAULT false;

-- Create system BREAK player for bye matches (idempotent).
-- Nickname uses '__BREAK__' (not 'BREAK') to avoid unique constraint collision
-- if a real player ever has the nickname 'BREAK'.
INSERT INTO "Player" (id, name, nickname, "createdAt", "updatedAt")
VALUES ('__BREAK__', 'BREAK', '__BREAK__', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
