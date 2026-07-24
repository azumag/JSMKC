-- #3047: persist standard TA Phase 3 manual life settings as absolute-value
-- timeline events so undo/cancel and round-history replay retain them.
CREATE TABLE "TTPhaseLifeAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "oldLives" INTEGER NOT NULL,
  "newLives" INTEGER NOT NULL,
  "entryVersion" INTEGER NOT NULL,
  "adjustedById" TEXT,
  "adjustedByName" TEXT NOT NULL,
  "afterRoundId" TEXT,
  "afterRoundNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TTPhaseLifeAdjustment_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TTPhaseLifeAdjustment_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "TTEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TTPhaseLifeAdjustment_tournamentId_createdAt_idx"
  ON "TTPhaseLifeAdjustment"("tournamentId", "createdAt");
CREATE INDEX "TTPhaseLifeAdjustment_tournamentId_afterRoundNumber_idx"
  ON "TTPhaseLifeAdjustment"("tournamentId", "afterRoundNumber");
CREATE INDEX "TTPhaseLifeAdjustment_entryId_createdAt_idx"
  ON "TTPhaseLifeAdjustment"("entryId", "createdAt");

-- PR #3042 already emitted a structured AuditLog row for every successful
-- set_lives call. Backfill those rows so saved tournaments such as
-- "CDM 2025 replica" receive replayable events without another adjustment.
INSERT INTO "TTPhaseLifeAdjustment" (
  "id",
  "tournamentId",
  "entryId",
  "playerId",
  "oldLives",
  "newLives",
  "entryVersion",
  "adjustedById",
  "adjustedByName",
  "afterRoundId",
  "afterRoundNumber",
  "createdAt"
)
SELECT
  audit."id" || '-ta-life',
  entry."tournamentId",
  entry."id",
  entry."playerId",
  CAST(json_extract(audit."details", '$.oldLives') AS INTEGER),
  CAST(json_extract(audit."details", '$.newLives') AS INTEGER),
  ROW_NUMBER() OVER (
    PARTITION BY entry."id"
    ORDER BY audit."timestamp", audit."id"
  ),
  audit."userId",
  COALESCE(NULLIF(TRIM(actor."name"), ''), 'Administrator'),
  (
    SELECT round."id"
    FROM "TTPhaseRound" AS round
    WHERE round."tournamentId" = entry."tournamentId"
      AND round."phase" = 'phase3'
      AND round."submittedAt" IS NOT NULL
      AND round."submittedAt" <= audit."timestamp"
    ORDER BY round."submittedAt" DESC, round."roundNumber" DESC
    LIMIT 1
  ),
  COALESCE(
    (
      SELECT round."roundNumber"
      FROM "TTPhaseRound" AS round
      WHERE round."tournamentId" = entry."tournamentId"
        AND round."phase" = 'phase3'
        AND round."submittedAt" IS NOT NULL
        AND round."submittedAt" <= audit."timestamp"
      ORDER BY round."submittedAt" DESC, round."roundNumber" DESC
      LIMIT 1
    ),
    0
  ),
  audit."timestamp"
FROM "AuditLog" AS audit
JOIN "TTEntry" AS entry ON entry."id" = audit."targetId"
LEFT JOIN "User" AS actor ON actor."id" = audit."userId"
WHERE audit."targetType" = 'TTEntry'
  AND json_valid(audit."details")
  AND json_extract(audit."details", '$.action') = 'set_lives'
  AND json_type(audit."details", '$.oldLives') = 'integer'
  AND json_type(audit."details", '$.newLives') = 'integer';
