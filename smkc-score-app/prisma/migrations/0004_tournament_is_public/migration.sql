-- Add isPublic column: new tournaments default to private (false).
-- Existing tournaments are grandfathered as public (true) to avoid
-- breaking currently visible tournaments on deploy.
ALTER TABLE "Tournament" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Tournament" SET "isPublic" = true WHERE "deletedAt" IS NULL;
