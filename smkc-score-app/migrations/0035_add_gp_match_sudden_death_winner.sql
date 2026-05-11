-- Keep Wrangler/D1 migrations aligned with Prisma migration
-- 0003_gp_match_sudden_death_winner.
ALTER TABLE `GPMatch` ADD COLUMN `suddenDeathWinnerId` TEXT;
