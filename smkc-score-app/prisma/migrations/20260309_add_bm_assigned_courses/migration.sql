-- Add assignedCourses field to BMMatch for pre-assignment of 4 courses per match (§5.4, §6.3)
ALTER TABLE "BMMatch" ADD COLUMN "assignedCourses" JSONB;
