-- Migration: Add broadcast match info fields to Tournament for overlay display.
-- Mirrors prisma/migrations/0007_overlay_broadcast_match_info (Prisma CLI is
-- local-only; this wrangler-format file is the one D1 production actually
-- applies).
--
-- overlayMatchLabel: round label shown in dashboard footer when "配信に反映" is pressed (e.g., "決勝 QF")
-- overlayPlayer1Wins / overlayPlayer2Wins: current wins in the broadcast match
-- overlayMatchFt: First-To target wins for the broadcast match (BM/MR finals: 5)
ALTER TABLE "Tournament" ADD COLUMN "overlayMatchLabel" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "overlayPlayer1Wins" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "overlayPlayer2Wins" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "overlayMatchFt" INTEGER;
