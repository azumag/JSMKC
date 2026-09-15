# Prisma / D1 migration history policy

JSMKC keeps database migrations in two independent histories:

- `smkc-score-app/prisma/migrations/**/migration.sql` — Prisma schema history.
- `smkc-score-app/migrations/**/*.sql` — SQL applied to Cloudflare D1 by Wrangler.

A schema change that needs a migration must add both sides in the same PR. The `Prisma / D1 migration parity` CI job requires the number of newly added Prisma migration SQL files and D1 migration SQL files to match 1:1.

## Existing migrations are immutable

Once a migration SQL file is committed, treat it as applied history. Do not edit, delete, or rename an existing migration entry to change its meaning. A database that already recorded the old migration would not replay the rewritten file, while a fresh database would see the new contents, causing the two environments to diverge.

If a previous migration needs correction, add a new forward migration instead. Keep it backward-compatible with the independently triggered Cloudflare Workers deployment as described in `CLAUDE.md`.

CI enforces this append-only rule with `smkc-score-app/scripts/check-migration-history.cjs`. On pull requests the script compares the base and head commits using `git diff --name-status --find-renames` and fails closed when a managed migration SQL file has any status other than a new addition (`A`). Rename statuses are rejected even when Git reports 100% similarity.

The guard intentionally does not inspect application source changes or non-SQL documentation under the migration directories.

## Local verification

From `smkc-score-app/`, compare two commits with:

```bash
BASE_SHA=<base commit> HEAD_SHA=<head commit> node scripts/check-migration-history.cjs
```

For test/debug use only, `MIGRATION_DIFF_INPUT` can supply a synthetic `git diff --name-status` payload. CI never sets that variable.
