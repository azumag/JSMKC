-- Store broadcast overlay coordinate overrides for names, scores, and footer.
ALTER TABLE "Tournament" ADD COLUMN "overlayLayout" TEXT NOT NULL DEFAULT '{}';
