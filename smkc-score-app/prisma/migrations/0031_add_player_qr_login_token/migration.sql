-- #3055: QR code one-scan login. Stores only a SHA-256 hash of a
-- high-entropy (256-bit) bearer token embedded in the player's QR code,
-- never the raw token. A single active token per player: issuing a new
-- one overwrites the previous hash, immediately invalidating the old QR
-- code (decision #3055 — no expiry, manual revoke/reissue by the player
-- or an admin only).
ALTER TABLE "Player" ADD COLUMN "qrLoginTokenHash" TEXT;
ALTER TABLE "Player" ADD COLUMN "qrLoginTokenIssuedAt" DATETIME;

CREATE UNIQUE INDEX "Player_qrLoginTokenHash_key" ON "Player"("qrLoginTokenHash");
