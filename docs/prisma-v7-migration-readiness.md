# Prisma 7 migration readiness for #3114

Prisma ORM 7 contains the upstream `deepmerge-ts >=8` remediation needed to remove the temporary GHSA-ggr8-5vv4-36mx audit exception tracked in #3114, but moving JSMKC from Prisma 6 to Prisma 7 is a major-version migration and must not be performed only to silence the audit finding.

The repository therefore has a read-only readiness probe:

```bash
cd smkc-score-app
node scripts/prisma-v7-readiness.cjs
node scripts/prisma-v7-readiness.cjs --json
```

The probe uses a `.cjs` extension deliberately so it remains executable while the migration evaluates a top-level `"type": "module"` change. It reads `package.json`, `package-lock.json`, `prisma/schema.prisma`, the contents of `prisma.config.ts` and `tsconfig.json` when present, records the Node.js runtime executing the probe, and scans application source files under `src/` to inventory legacy `@prisma/client` imports. It never runs `npm install`, generates a client, edits source files or the lockfile, changes TypeScript configuration, changes D1, or modifies the #3114 exception.

A companion read-only probe, documented in `docs/prisma-v7-support-surface.md`, inventories legacy Prisma package references outside application source (tests, Jest setup, E2E/tooling, and Next.js externalization). Run both probes before an explicit Prisma 7 migration so the application import migration does not hide support-code/build work that would otherwise surface only after CI or Cloudflare build failures.

A second companion probe, documented in `docs/prisma-v7-esm-surface.md`, inventories Node/test helper `.js` files that still use CommonJS constructs. This makes the impact of a future top-level `"type": "module"` switch concrete without renaming or rewriting any executable today.

## Checks

The probe records the migration prerequisites that must be handled together in an explicit Prisma 7 dependency-migration PR:

- the Node.js runtime executing the probe satisfies Prisma 7's supported runtime floor: Node `^20.19.0`, `^22.12.0`, or `^24.0.0`. Unsupported minors, odd-numbered majors, and prerelease runtimes remain explicit blockers instead of being hidden behind a generic `Node 22` workflow label.
- `package.json` uses ESM (`"type": "module"`). Prisma 7's generated client and CLI configuration are ESM-first, so this change must be assessed against the repository's existing CommonJS helper scripts rather than applied mechanically. The companion ESM-surface inventory records those `.js` helpers before this switch is attempted.
- `package.json` declares `prisma`, `@prisma/client`, and `@prisma/adapter-d1` on target major 7 and their declared majors are aligned.
- `package-lock.json` is present and its installed `node_modules/prisma`, `node_modules/@prisma/client`, and `node_modules/@prisma/adapter-d1` entries are all on target major 7 with aligned installed majors. Manifest selectors alone are not sufficient migration evidence because a stale or partial lockfile can still install a mixed Prisma package set.
- the Prisma generator uses `provider = "prisma-client"` rather than the legacy `prisma-client-js` provider.
- the generator has an explicit output directory, because application imports must move from `@prisma/client` to the generated client path as part of the v7 migration.
- application source under `src/` no longer imports `@prisma/client` or its runtime subpaths. The probe records each matching source path and package specifier so the migration PR has a concrete import inventory instead of discovering these call sites only after generation/type-check failures.
- `datasource.url` has moved out of `schema.prisma`.
- `prisma.config.ts` exists for CLI datasource/configuration.
- `prisma.config.ts` contains a `datasource.url` entry. File presence alone is not enough: without the URL in Prisma config, removing `datasource.url` from the schema would leave the CLI migration/generation path incomplete.
- `prisma.config.ts` no longer contains the Prisma 6-only `engine` option. JSMKC currently needs `engine = "classic"` for its staged Prisma 6 datasource-config path, but Prisma 7 removes that option entirely, so it must be deleted in the explicit major-version migration rather than carried forward accidentally.
- `tsconfig.json` is present and keeps the Prisma 7 ESM-consumption settings from the upstream migration guide: `module = "ESNext"`, `moduleResolution = "bundler"`, and `target = "ES2023"` or newer (`ESNext` is also accepted).

These checks follow Prisma's v7 migration guidance. They are intentionally migration evidence, not an automatic upgrade gate. Prisma's current v7 system requirements list Node.js `^20.19.0`, `^22.12.0`, or `^24.0.0`; the manual security-review workflow already runs the probe under the repository's Node 22 CI setup, and the probe now records the exact runtime version and marks unsupported runtimes as migration blockers rather than assuming that a major-only configuration is sufficient.

## Current repository evidence

Current `main` has:

- `prisma: ^6.19.3`
- `@prisma/client: ^6.19.3`
- `@prisma/adapter-d1: ^7.8.0`
- `package-lock.json` currently resolves the Prisma CLI/client on major 6 and the D1 adapter on major 7; the readiness probe reports those installed versions separately from the manifest selectors, so a future dependency edit cannot appear migration-ready while the lockfile still contains a mixed-major set
- no top-level `"type": "module"`
- CI workflows use Node 22; the readiness probe records the exact Node runtime used for each review and verifies it is at least 22.12.0 on that line
- multiple Node/E2E `.js` helpers still using CommonJS constructs; `scripts/prisma-v7-esm-surface.cjs` inventories those files without changing them
- `provider = "prisma-client-js"`
- no explicit generator `output`
- `datasource db` still contains `url = env("DATABASE_URL")`; removing it remains part of the explicit Prisma 7 migration because that schema edit changes the CLI contract used by the currently installed Prisma 6 toolchain
- `prisma.config.ts` now defines `datasource.url` from the same `DATABASE_URL` environment variable, so CLI datasource configuration is staged before the major upgrade instead of being introduced at the same time as all other Prisma 7 changes
- while the CLI remains on Prisma 6.19.x, `prisma.config.ts` keeps `engine = "classic"`. The readiness probe now reports this as `prismaConfigOmitsRemovedEngine = needs migration` because Prisma 7 removes the `engine` option; the setting remains in place until the major upgrade so the current Prisma 6 CLI contract is not changed prematurely
- `tsconfig.json` uses `module = "esnext"`, `moduleResolution = "bundler"`, and `target = "ES2023"`; the target was raised independently from ES2017 so this non-Prisma prerequisite can be validated by the normal application/Cloudflare CI before the major dependency migration
- application source still contains imports from `@prisma/client` and `@prisma/client/runtime/...`; these are listed by the readiness probe as explicit migration work

The Prisma 6 datasource-config staging follows the upstream 6.18 migration path documented in the Prisma changelog (`https://www.prisma.io/changelog/2025-10-22`). The config reads `process.env.DATABASE_URL ?? ""` rather than Prisma's strict `env()` helper because every Prisma CLI command loads `prisma.config.ts`; this preserves generate-only CI where no database URL is needed while still passing the configured URL to database commands when the environment provides it. This step intentionally leaves the schema URL in place for now, so the readiness probe still reports `datasourceUrlMovedOutOfSchema` until the explicit major-version migration removes it.

The existing adapter is already on major 7 while CLI/client remain on major 6. The readiness probe surfaces that version split both at the manifest-selector layer and in the installed lockfile package set without asserting that it is itself the cause of the current production behavior or changing it automatically.

The ES2023 target is intentionally guarded by a repository-level readiness regression test. Future target upgrades remain allowed, but lowering the target below Prisma 7's documented requirement will fail that test instead of silently reintroducing a migration blocker. The Node runtime rule is similarly covered with boundary tests for the supported 20.19, 22.12, and 24.x lines so a future CI/runtime change cannot silently invalidate Prisma 7 readiness evidence. The installed-package checks are covered separately so a partial dependency update or stale `package-lock.json` remains an explicit blocker even when `package.json` already declares Prisma 7 across the package set.

## Migration decision boundary

When an explicit Prisma 7 migration is approved, the dependency update PR should change the Prisma package set and lockfile together with schema/config/imports as one coherent migration, preserve the now-compatible TypeScript module target and staged datasource configuration, remove the Prisma 6-only `engine` setting required by the transitional config, resolve the recorded CommonJS `.js` helper surface before enabling top-level ESM, regenerate the client, and verify at minimum:

1. Prisma generate and type checking on a supported Node runtime.
2. unit tests and lint/format.
3. Prisma/D1 migration parity.
4. Cloudflare/OpenNext build.
5. D1 adapter behavior on a real preview path, including representative reads and writes.
6. security-audit and any affected E2E/helper entry points after ESM conversion/renaming.
7. `package-lock.json` resolves all three Prisma packages to the intended target major with no mixed-major residue.
8. `npm audit --audit-level=high` with the #3114 exception removed only after the vulnerable dependency edge is actually gone from the installed lockfile graph.

If any of these require a behavior or deployment-policy decision, record it on #3114 (or a dedicated migration issue) rather than weakening the audit gate or applying a consumer-side major override.

## Manual security review integration

The manual `Security audit review` workflow also runs the readiness, support-code, and ESM-surface probes after collecting the compatible-range and next-major upstream evidence. The probes remain advisory: they use `continue-on-error`, are not referenced by the compatible-range fail-closed gate, and cannot trigger a Prisma major upgrade or change the #3114 exception.

The probes write their detailed readiness tables to the GitHub Actions job summary, including both manifest selectors and installed lockfile versions for the Prisma package set, the executing Node.js runtime, legacy Prisma import inventory, Prisma config datasource and removed-engine checks, TypeScript module settings, support-code Prisma references, and CommonJS `.js` helper inventory. This keeps migration evidence available during each manual review without expanding the existing compatible-range gate contract: reviewers can see both whether a patched Prisma 7 dependency chain exists upstream and which local migration prerequisites still need work before an explicit migration PR is safe to attempt.
