ALTER TABLE "Tournament" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Tournament_slug_key" ON "Tournament"("slug");
