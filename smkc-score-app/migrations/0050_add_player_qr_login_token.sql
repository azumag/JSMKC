-- #3055: QR code one-scan login. Stores only a SHA-256 hash of a
-- high-entropy (256-bit) bearer token embedded in the player's QR code,
-- never the raw token. A single active token per player: issuing a new
-- one overwrites the previous hash, immediately invalidating the old QR
-- code (decision #3055 — no expiry, manual revoke/reissue by the player
-- or an admin only).
--
-- Mirrors prisma/migrations/0031_add_player_qr_login_token/migration.sql.
-- That Prisma migration was committed in PR #3055 without a matching D1
-- migration file here, so `npm run deploy` never applied it to D1 while
-- the deployed Worker code (Prisma Client generated from schema.prisma)
-- already expected these columns — causing every Player query, including
-- GET /api/players, to fail with "no such column" on both production and
-- preview.
ALTER TABLE "Player" ADD COLUMN "qrLoginTokenHash" TEXT;
ALTER TABLE "Player" ADD COLUMN "qrLoginTokenIssuedAt" DATETIME;

CREATE UNIQUE INDEX "Player_qrLoginTokenHash_key" ON "Player"("qrLoginTokenHash");
