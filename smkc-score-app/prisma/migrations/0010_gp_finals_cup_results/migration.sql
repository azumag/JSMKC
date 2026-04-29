-- Store multi-cup GP finals/playoff results for FT cup-win matches.
ALTER TABLE "GPMatch" ADD COLUMN "cupResults" JSONB;
