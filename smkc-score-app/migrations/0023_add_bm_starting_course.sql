-- Migration: Add startingCourseNumber to BMMatch for bracket starting course assignment
-- Mirrors prisma/migrations/0008_bm_starting_course (Prisma CLI is local-only; this
-- wrangler-format file is the one D1 production actually applies).
-- Values 1-4 correspond to Battle Course 1 through 4. NULL means not yet assigned
-- (qualification matches remain NULL). Bracket (finals/barrage) matches receive a
-- random value per round at bracket creation. Admins can override per match via the
-- score dialog.
ALTER TABLE "BMMatch" ADD COLUMN "startingCourseNumber" INTEGER;
