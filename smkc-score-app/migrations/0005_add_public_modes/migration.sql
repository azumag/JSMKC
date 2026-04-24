-- Add publicModes column: array of mode names that are publicly visible.
-- Default is empty (all modes private) — admin enables modes individually.
-- Empty array means all modes hidden from non-admin users.
ALTER TABLE `Tournament` ADD COLUMN `publicModes` TEXT NOT NULL DEFAULT '[]';
-- Initialize existing tournaments: all modes public (grandfather existing behavior)
UPDATE `Tournament` SET `publicModes` = '["ta","bm","mr","gp"]' WHERE `deletedAt` IS NULL;
-- Note: isPublic column is kept for backward compatibility during migration period.
-- It will be removed in a future migration after all code references are updated.