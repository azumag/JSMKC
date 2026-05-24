UPDATE "Tournament"
SET "publicModes" = json_insert(
  COALESCE("publicModes", '[]'),
  '$[#]',
  'overall'
)
WHERE
  "status" IN ('active', 'completed')
  AND "deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(COALESCE("publicModes", '[]'))
    WHERE value = 'overall'
  );
