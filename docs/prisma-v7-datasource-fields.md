# Prisma 7 datasource field readiness

This note extends the read-only Prisma 7 migration evidence tracked by #3114.

Prisma ORM 7 moves database connection configuration out of `schema.prisma` and into `prisma.config.ts`. In addition to `datasource.url`, the Prisma 7 upgrade guide calls out `directUrl` and `shadowDatabaseUrl` as schema fields that must not be carried forward unchanged.

The existing `smkc-score-app/scripts/prisma-v7-readiness.cjs` probe therefore treats all three schema assignments as explicit migration blockers:

- `datasourceUrlMovedOutOfSchema`
- `datasourceDirectUrlMovedOutOfSchema`
- `datasourceShadowDatabaseUrlMovedOutOfSchema`

The check is intentionally read-only. It does not move connection strings, change environment variables, edit Prisma configuration, update dependencies, generate a client, touch D1, or remove the temporary #3114 audit exception.

## Current JSMKC state

Current `main` still keeps `url = env("DATABASE_URL")` in `prisma/schema.prisma` for the staged Prisma 6 CLI contract, so `datasourceUrlMovedOutOfSchema` remains a known migration blocker until the explicit major-version migration.

`directUrl` and `shadowDatabaseUrl` are not currently present in the schema, so the two new checks are already satisfied. Regression coverage ensures that either field cannot be introduced later without becoming visible in the Prisma 7 readiness output.

`prisma.config.ts` already contains the staged `datasource.url` entry used by the current Prisma 6 migration path. Any future need for a shadow database or a separate migration connection must be handled deliberately in Prisma config during the major-version migration rather than by reintroducing removed schema fields.

## Migration boundary

When Prisma 7 migration work is explicitly approved, update the Prisma package set, schema, `prisma.config.ts`, generated-client imports, ESM boundary, and D1 adapter verification as one coherent migration. Do not remove the #3114 audit exception merely because these datasource-field checks pass; the vulnerable installed dependency edge must actually be gone and the full security audit must pass without the exception.

Upstream reference: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
