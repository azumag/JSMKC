-- Migration: Add broadcast player name fields to Tournament
-- Stores the current overlay player names (1P/2P) for the "配信に反映" feature.
-- Admin sets these by clicking "配信に反映" on a match or via the 配信管理 page.
-- Nullable so existing rows remain valid; empty string = no name displayed.
ALTER TABLE "Tournament" ADD COLUMN "overlayPlayer1Name" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "overlayPlayer2Name" TEXT;
