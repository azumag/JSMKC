-- Indexes used by /api/tournaments/[id]/overlay-events early-return path.
--
-- The handler's first query — `_max(updatedAt)` per tournament-scoped table —
-- decides whether the 17 detail queries run at all. Without these indexes,
-- D1 would have to do a full row scan per aggregate even though only the
-- maximum is needed. The composite shape (tournamentId, updatedAt) lets
-- SQLite resolve the aggregate as a single B-tree descent.
--
-- BMMatch / MRMatch / GPMatch already carry an index on
-- (tournamentId, stage, completed) from migration 0024; that one does NOT
-- help with `MAX(updatedAt)` because updatedAt isn't part of the prefix.

CREATE INDEX IF NOT EXISTS "BMMatch_tournamentId_updatedAt_idx"
  ON "BMMatch" ("tournamentId", "updatedAt");
CREATE INDEX IF NOT EXISTS "MRMatch_tournamentId_updatedAt_idx"
  ON "MRMatch" ("tournamentId", "updatedAt");
CREATE INDEX IF NOT EXISTS "GPMatch_tournamentId_updatedAt_idx"
  ON "GPMatch" ("tournamentId", "updatedAt");

CREATE INDEX IF NOT EXISTS "TTEntry_tournamentId_updatedAt_idx"
  ON "TTEntry" ("tournamentId", "updatedAt");
CREATE INDEX IF NOT EXISTS "TTPhaseRound_tournamentId_createdAt_idx"
  ON "TTPhaseRound" ("tournamentId", "createdAt");

-- ScoreEntryLog uses `timestamp` (not updatedAt) for its delta predicate.
CREATE INDEX IF NOT EXISTS "ScoreEntryLog_tournamentId_timestamp_idx"
  ON "ScoreEntryLog" ("tournamentId", "timestamp");

-- TournamentPlayerScore is the canonical "did anything change" pulse for
-- the whole-tournament aggregation. Its existing single-column index on
-- tournamentId is enough for filtering, but adding updatedAt lets us serve
-- the early-return MAX without touching row payloads.
CREATE INDEX IF NOT EXISTS "TournamentPlayerScore_tournamentId_updatedAt_idx"
  ON "TournamentPlayerScore" ("tournamentId", "updatedAt");
