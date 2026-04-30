-- Speed up TA rank-only recalculation after entry deletion.
CREATE INDEX IF NOT EXISTS "TTEntry_tournamentId_stage_idx" ON "TTEntry"("tournamentId", "stage");
CREATE INDEX IF NOT EXISTS "TTEntry_tournamentId_stage_qualificationPoints_totalTime_idx" ON "TTEntry"("tournamentId", "stage", "qualificationPoints", "totalTime");
