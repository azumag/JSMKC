-- Migration: Insert system BREAK player for BYE matches in round-robin scheduling
--
-- The round-robin circle method (§10.4) adds a synthetic BREAK player when the
-- group has an odd number of participants. BYE matches use '__BREAK__' as player2Id,
-- which references this Player record. Without this row, D1's FK constraints cause
-- a 500 error when setting up groups with an odd number of players.
--
-- This player is never shown in the UI — it is filtered from all player-listing
-- queries in the application (BREAK_PLAYER_ID filter in /api/players).
INSERT OR IGNORE INTO "Player" ("id", "name", "nickname", "createdAt", "updatedAt")
VALUES ('__BREAK__', '__BREAK__', '__BREAK__', datetime('now'), datetime('now'));
