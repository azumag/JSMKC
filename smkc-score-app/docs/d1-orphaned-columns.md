# D1 orphaned columns

This document tracks columns that may remain physically present in deployed Cloudflare D1 databases after they have been removed from the Prisma schema.

## Current inventory

| Table    | Column              | Removed from Prisma      | Replacement / reason                                                | Physical cleanup status                         |
| -------- | ------------------- | ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------- |
| `Player` | `ttSeeding`         | historical schema change | Seeding is tournament-specific and now belongs to `TTEntry.seeding` | Intentionally retained in existing D1 databases |
| `Player` | `taHandicapSeconds` | issue #2995              | See the `Player` model note in `prisma/schema.prisma`               | Intentionally retained in existing D1 databases |

This inventory is authoritative for which physical columns are intentionally retained and their cleanup status. Field-specific rationale should live next to the canonical Prisma model or migration when such a source exists; otherwise, the inventory must retain a self-contained explanation instead of linking to a missing or unverifiable source.

These columns are not application API and must not be reintroduced into `prisma/schema.prisma`, DTOs, selectors, or business logic merely because they are visible in a deployed database.

## Migration policy

When a Prisma field must be removed but an in-place D1 migration cannot be safely guaranteed:

1. Remove all application reads and writes first.
2. Move or backfill required data into the replacement column before removing the Prisma field.
3. Remove the field from `prisma/schema.prisma`.
4. Add the physical column to the inventory above, including the originating issue or migration when it is verifiable.
5. Link to a canonical field-removal rationale when one exists; otherwise, keep a self-contained explanation in the inventory.
6. Do not reuse the old column name for a different meaning.

## Physical cleanup plan

Physical removal must be handled as a dedicated, reviewed migration rather than being mixed into a feature change. The cleanup migration must:

- rebuild the affected table with the current canonical schema;
- copy every retained column explicitly;
- recreate indexes, unique constraints, foreign keys, and defaults;
- verify row counts and critical constraints before replacing the old table;
- be tested against a production-like D1 snapshot and a fresh database;
- include a rollback or restore procedure and a maintenance/deployment plan.

Until such a migration is prepared and validated, this inventory is the source of truth for intentional D1/Prisma schema differences.

## Review checklist

Before approving a field-removal PR:

- [ ] no application import, query, selector, type, fixture, or API response still uses the field;
- [ ] required data has been migrated or deliberately discarded;
- [ ] the Prisma schema represents the desired application schema;
- [ ] this inventory is updated when the physical D1 column remains;
- [ ] the inventory links to a valid canonical rationale or contains a self-contained explanation;
- [ ] migration comments and the PR body explain the divergence and future cleanup path.
