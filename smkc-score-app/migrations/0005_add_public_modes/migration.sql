-- Add publicModes column: array of mode names that are publicly visible.
-- Default is all 4 modes public for backward compatibility.
-- Empty array means all modes hidden from non-admin users.
ALTER TABLE `Tournament` ADD COLUMN `publicModes` TEXT NOT NULL DEFAULT '["ta","bm","mr","gp"]';
-- Initialize existing tournaments: preserve isPublic behavior, default to all public
UPDATE `Tournament` SET `publicModes` = '["ta","bm","mr","gp"]' WHERE `deletedAt` IS NULL;
-- Note: isPublic column is kept for backward compatibility during migration period.
-- It will be removed in a future migration after all code references are updated.