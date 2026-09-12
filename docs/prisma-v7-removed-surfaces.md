# Prisma 7 removed-surface readiness

Tracking: #3114

Prisma ORM 7 removes several v6 surfaces that can survive an otherwise mechanical dependency upgrade. The official v7 upgrade guide specifically removes the client middleware API, the Metrics preview feature, `--skip-generate` / `--skip-seed`, the `--schema` / `--url` connection flags from `prisma db execute`, and several legacy `prisma migrate diff` datasource flags.

JSMKC now keeps these removals visible with a read-only probe:

```bash
cd smkc-score-app
node scripts/prisma-v7-removed-surfaces.cjs
node scripts/prisma-v7-removed-surfaces.cjs --json
```

The probe checks:

- application source under `src/` for `prisma.$use(...)` and `prisma.$metrics` usage;
- the Prisma client generator for the removed `metrics` preview feature;
- repository command surfaces (`package.json`, `scripts/`, `e2e/`, and GitHub workflows) for removed migration and `db execute` flags.

A clean result does **not** make the repository Prisma 7-ready by itself. Package versions, generated-client imports, ESM conversion, Prisma Config, D1 adapter wiring, TypeScript prerequisites, and the #3114 audit exception are covered by the other migration probes and remain separate decisions.

The Prisma 6 engine environment variables used by Cloudflare generation are also intentionally excluded from this probe. They are already protected by the existing Prisma-major guard so Prisma 7 takes the plain `prisma generate` path; duplicating that check here would incorrectly report the maintained v6 compatibility branch as an unconditional blocker.

## Why this remains advisory

The probe only inventories migration blockers. It does not rewrite application code, change commands, update Prisma packages, modify the lockfile, or remove the temporary security-audit exception. A Prisma major upgrade still requires an explicit dependency migration PR and full CI / Cloudflare compatibility validation.

Reference: Prisma ORM 7 upgrade guide, <https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7>.
