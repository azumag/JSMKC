-- Migration: Add qualificationConfirmed to Tournament
-- BM/MR/GP予選確定フラグ。trueの場合スコア入力・編集・レポートを全てブロック
-- Default false for backward compatibility with existing tournaments
ALTER TABLE "Tournament" ADD COLUMN "qualificationConfirmed" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Tournament" ADD COLUMN "qualificationConfirmedAt" DATETIME;
