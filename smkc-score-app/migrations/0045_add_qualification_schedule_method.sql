-- #3033: existing tournaments retain the legacy circle schedule unless an
-- administrator explicitly opts into the CDM workbook fixture.
ALTER TABLE `Tournament` ADD COLUMN `qualificationScheduleMethod` TEXT NOT NULL DEFAULT 'circle';
