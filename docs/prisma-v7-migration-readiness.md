# Prisma 7 migration readiness for #3114

Prisma ORM 7 contains the upstream `deepmerge-ts >=8` remediation needed to remove the temporary GHSA-ggr8-5vv4-36mx audit exception tracked in #3114, but moving JSMKC from Prisma 6 to Prisma 7 is a major-version migration and must not be performed only to silence the audit finding.

The repository therefore has a read-only readiness probe:

```bash
cd smkc-score-app
node scripts/prisma-v7-readiness.cjs
node scripts/prisma-v7-readiness.cjs --json
```

The probe uses a `.cjs` extension deliberately so it remains executable while the migration evaluates a top-level `"type": "module"` change. It reads `package.json`, `prisma/schema.prisma`, the contents of `prisma.config.ts` when present, and application source files under `src/` to inventory legacy `@prisma/client` imports. It never runs `npm install`, generates a client, edits source files or the lockfile, changes D1, or modifies the #3114 exception.

A companion read-only probe, documented in `docs/prisma-v7-support-surface.md`, inventories legacy Prisma package references outside application source (tests, Jest setup, E2E/tooling, and Next.js externalization). Run both probes before an explicit Prisma 7 migration so the application import migration does not hide support-code/build work that would otherwise surface only after CI or Cloudflare build failures.

## Checks

The probe records the migration prerequisites that must be handled together in an explicit Prisma 7 dependency-migration PR:

- `package.json` uses ESM (`"type": "module"`). Prisma 7's generated client and CLI configuration are ESM-first, so this change must be assessed against the repository's existing CommonJS helper scripts rather than applied mechanically.
- `prisma`, `@prisma/client`, and `@prisma/adapter-d1` are all on target major 7 and their majors are aligned.
- the Prisma generator uses `provider = "prisma-client"` rather than the legacy `prisma-client-js` provider.
- the generator has an explicit output directory, because application imports must move from `@prisma/client` to the generated client path as part of the v7 migration.
- application source under `src/` no longer imports `@prisma/client` or its runtime subpaths. The probe records each matching source path and package specifier so the migration PR has a concrete import inventory instead of discovering these call sites only after generation/type-check failures.
- `datasource.url` has moved out of `schema.prisma`.
- `prisma.config.ts` exists for CLI datasource/configuration.
- `prisma.config.ts` contains a `datasource.url` entry. File presence alone is not enough: without the URL in Prisma config, removing `datasource.url` from the schema would leave the CLI migration/generation path incomplete.

These checks follow Prisma's v7 migration guidance. They are intentionally migration evidence, not an automatic upgrade gate.

## Current repository evidence

Current `main` has:

- `prisma: ^6.19.3`
- `@prisma/client: ^6.19.3`
- `@prisma/adapter-d1: ^7.8.0`
- no top-level `"type": "module"`
- `provider = "prisma-client-js"`
- no explicit generator `output`
- `datasource db` still contains `url = env("DATABASE_URL")`
- `prisma.config.ts` already exists for schema/migrations configuration, but it does not yet define `datasource.url`; the readiness probe now reports that separately from simple config-file presence
- application source still contains imports from `@prisma/client` and `@prisma/client/runtime/...`; these are now listed by the readiness probe as explicit migration work

The existing adapter is already on major 7 while CLI/client remain on major 6. The readiness probe surfaces that version split without asserting that it is itself the cause of the current production behavior or changing it automatically.

## Migration decision boundary

When an explicit Prisma 7 migration is approved, the dependency update PR should change the Prisma package set and schema/config/imports as one coherent migration, regenerate the client, and verify at minimum:

1. Prisma generate and type checking.
2. unit tests and lint/format.
3. Prisma/D1 migration parity.
4. Cloudflare/OpenNext build.
5. D1 adapter behavior on a real preview path, including representative reads and writes.
6. `npm audit --audit-level=high` with the #3114 exception removed only after the vulnerable dependency edge is actually gone from the installed lockfile graph.

If any of these require a behavior or deployment-policy decision, record it on #3114 (or a dedicated migration issue) rather than weakening the audit gate or applying a consumer-side major override.

## Manual security review integration

The manual `Security audit review` workflow also runs this readiness probe after collecting the compatible-range and next-major upstream evidence. The probe remains advisory: it uses `continue-on-error`, is not referenced by the compatible-range fail-closed gate, and cannot trigger a Prisma major upgrade or change the #3114 exception.

The probe writes its detailed readiness table, including the legacy Prisma import inventory and the Prisma config datasource check, to the GitHub Actions job summary, and its step result remains visible in the workflow run. This keeps the migration evidence available during each manual review without expanding the existing compatible-range gate contract: reviewers can see both whether a patched Prisma 7 dependency chain exists upstream and which local migration prerequisites still need work before an explicit migration PR is safe to attempt.
