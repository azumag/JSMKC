-- Add dualReportEnabled to Tournament (default: false)
ALTER TABLE Tournament ADD COLUMN dualReportEnabled BOOLEAN NOT NULL DEFAULT 0;
