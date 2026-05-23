UPDATE "Tournament"
SET "publicModes" = json_insert(
  "publicModes",
  '$[#]',
  'overall'
)
WHERE
  "status" IN ('active', 'completed')
  AND "deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM json_each("publicModes")
    WHERE value = 'overall'
  );
