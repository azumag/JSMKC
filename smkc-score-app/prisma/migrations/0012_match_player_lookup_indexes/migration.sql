-- Speed up qualification score recalculation.
-- Each score update fetches completed matches for both involved players.
-- These indexes let D1 constrain by tournament/stage/player side instead of
-- scanning every qualification match in the tournament.
CREATE INDEX IF NOT EXISTS "BMMatch_tournamentId_stage_player1Id_idx" ON "BMMatch"("tournamentId", "stage", "player1Id");
CREATE INDEX IF NOT EXISTS "BMMatch_tournamentId_stage_player2Id_idx" ON "BMMatch"("tournamentId", "stage", "player2Id");

CREATE INDEX IF NOT EXISTS "MRMatch_tournamentId_stage_player1Id_idx" ON "MRMatch"("tournamentId", "stage", "player1Id");
CREATE INDEX IF NOT EXISTS "MRMatch_tournamentId_stage_player2Id_idx" ON "MRMatch"("tournamentId", "stage", "player2Id");

CREATE INDEX IF NOT EXISTS "GPMatch_tournamentId_stage_player1Id_idx" ON "GPMatch"("tournamentId", "stage", "player1Id");
CREATE INDEX IF NOT EXISTS "GPMatch_tournamentId_stage_player2Id_idx" ON "GPMatch"("tournamentId", "stage", "player2Id");
