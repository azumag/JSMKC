-- Performance indexes (Phase 2 of /Users/azumag/.claude/plans/d1-replicated-forest.md)
--
-- Adds indexes targeting the hottest WHERE / orderBy combinations in the
-- tournament UI flows. These were identified by inspecting the queries in
-- src/lib/api-factories/* and src/lib/points/overall-ranking.ts. Each index
-- is `IF NOT EXISTS` so re-applying the migration is safe.
--
-- Why these specifically:
--   1. *Match(tournamentId, stage, completed)
--      Standings, finals fetch, score-input flows all filter on these three
--      columns together. The existing UNIQUE on (tournamentId, matchNumber,
--      stage) cannot satisfy the `completed` predicate without a row scan.
--   2. *Match(player1Id), *Match(player2Id)
--      Used by BYE-stat aggregation (qualification-route.ts) and per-player
--      finals lookups. Without these, the engine has to scan the whole match
--      table even when only one player's matches are needed.
--   3. *Qualification(tournamentId, group)
--      Standings orderBy = [{group: 'asc'}, {score: 'desc'}]. The existing
--      UNIQUE on (tournamentId, playerId) gives no help with the group order.
--   4. TTEntry(tournamentId, stage)
--      Used by overall-ranking.ts and TA standings. The existing UNIQUE
--      includes playerId so it cannot be used as a left-prefix for the
--      common (tournamentId, stage) lookup.
--
-- All indexes are non-unique because their purpose is purely lookup speed.
-- They cost write amplification on insert/update of these tables, which is
-- negligible during normal tournament operation (a few thousand rows per
-- tournament).

CREATE INDEX IF NOT EXISTS "BMMatch_tournamentId_stage_completed_idx"
  ON "BMMatch" ("tournamentId", "stage", "completed");
CREATE INDEX IF NOT EXISTS "MRMatch_tournamentId_stage_completed_idx"
  ON "MRMatch" ("tournamentId", "stage", "completed");
CREATE INDEX IF NOT EXISTS "GPMatch_tournamentId_stage_completed_idx"
  ON "GPMatch" ("tournamentId", "stage", "completed");

CREATE INDEX IF NOT EXISTS "BMMatch_player1Id_idx" ON "BMMatch" ("player1Id");
CREATE INDEX IF NOT EXISTS "BMMatch_player2Id_idx" ON "BMMatch" ("player2Id");
CREATE INDEX IF NOT EXISTS "MRMatch_player1Id_idx" ON "MRMatch" ("player1Id");
CREATE INDEX IF NOT EXISTS "MRMatch_player2Id_idx" ON "MRMatch" ("player2Id");
CREATE INDEX IF NOT EXISTS "GPMatch_player1Id_idx" ON "GPMatch" ("player1Id");
CREATE INDEX IF NOT EXISTS "GPMatch_player2Id_idx" ON "GPMatch" ("player2Id");

CREATE INDEX IF NOT EXISTS "BMQualification_tournamentId_group_idx"
  ON "BMQualification" ("tournamentId", "group");
CREATE INDEX IF NOT EXISTS "MRQualification_tournamentId_group_idx"
  ON "MRQualification" ("tournamentId", "group");
CREATE INDEX IF NOT EXISTS "GPQualification_tournamentId_group_idx"
  ON "GPQualification" ("tournamentId", "group");

CREATE INDEX IF NOT EXISTS "TTEntry_tournamentId_stage_idx"
  ON "TTEntry" ("tournamentId", "stage");
