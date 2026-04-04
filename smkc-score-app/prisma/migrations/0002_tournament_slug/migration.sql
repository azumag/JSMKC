ALTER TABLE "Tournament" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");
