-- Speed up qualification score recalculation in production D1.
-- Score updates fetch completed matches for each involved player; these
-- composite indexes let D1 constrain by tournament, stage, and player side.
CREATE INDEX IF NOT EXISTS "BMMatch_tournamentId_stage_player1Id_idx" ON "BMMatch"("tournamentId", "stage", "player1Id");
CREATE INDEX IF NOT EXISTS "BMMatch_tournamentId_stage_player2Id_idx" ON "BMMatch"("tournamentId", "stage", "player2Id");

CREATE INDEX IF NOT EXISTS "MRMatch_tournamentId_stage_player1Id_idx" ON "MRMatch"("tournamentId", "stage", "player1Id");
CREATE INDEX IF NOT EXISTS "MRMatch_tournamentId_stage_player2Id_idx" ON "MRMatch"("tournamentId", "stage", "player2Id");

CREATE INDEX IF NOT EXISTS "GPMatch_tournamentId_stage_player1Id_idx" ON "GPMatch"("tournamentId", "stage", "player1Id");
CREATE INDEX IF NOT EXISTS "GPMatch_tournamentId_stage_player2Id_idx" ON "GPMatch"("tournamentId", "stage", "player2Id");
