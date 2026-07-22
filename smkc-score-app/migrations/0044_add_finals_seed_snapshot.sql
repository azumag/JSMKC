-- The qualification ranking is mutable for correction workflows. Persist the
-- entrant's original qualification seed when a KO bracket is generated so
-- later corrections cannot rewrite an already-published bracket label.
ALTER TABLE "Tournament" ADD COLUMN "bmFinalsSeedSnapshot" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "mrFinalsSeedSnapshot" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "gpFinalsSeedSnapshot" TEXT;
