-- Existing tournaments retain the legacy circle schedule unless an admin opts
-- into the CDM workbook fixture before qualification setup.
ALTER TABLE "Tournament" ADD COLUMN "qualificationScheduleMethod" TEXT NOT NULL DEFAULT 'circle';
