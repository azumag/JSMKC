-- Add startingCourseNumber to BMMatch for bracket-mode starting course assignment.
-- Values 1-4 correspond to Battle Course 1 through 4.
-- NULL means not yet assigned (qualification matches remain NULL).
-- Bracket (finals / barrage) matches receive a random value per round at bracket creation.
-- Admins can override the value per match via the score dialog.
ALTER TABLE "BMMatch" ADD COLUMN "startingCourseNumber" INTEGER;
