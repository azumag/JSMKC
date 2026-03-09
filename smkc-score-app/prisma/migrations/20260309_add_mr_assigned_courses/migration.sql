-- Add assignedCourses field to MRMatch for pre-assignment of 4 courses per match (§10.5)
-- Courses are randomly shuffled at qualification setup time and stored here so players
-- see the pre-determined course list rather than freely selecting courses.
ALTER TABLE "MRMatch" ADD COLUMN "assignedCourses" JSONB;
