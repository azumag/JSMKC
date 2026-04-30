-- Store whether the currently reflected broadcast players need a no-camera overlay.
ALTER TABLE "Tournament" ADD COLUMN "overlayPlayer1NoCamera" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN "overlayPlayer2NoCamera" BOOLEAN NOT NULL DEFAULT false;
