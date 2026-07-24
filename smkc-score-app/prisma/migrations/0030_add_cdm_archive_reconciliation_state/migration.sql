ALTER TABLE "Tournament" ADD COLUMN "cdmArchiveReconciliationExcluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN "cdmArchiveReconciliationPending" BOOLEAN NOT NULL DEFAULT false;

-- Existing JSMKC records are protected permanently, including compact names such as JSMKC2025.
UPDATE "Tournament"
SET "cdmArchiveReconciliationExcluded" = true
WHERE instr(lower("name"), 'jsmkc') > 0
   OR instr(lower(COALESCE("slug", '')), 'jsmkc') > 0;
