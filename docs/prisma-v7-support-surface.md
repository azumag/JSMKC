# Prisma 7 support-code migration surface for #3114

The primary Prisma 7 readiness probe (`smkc-score-app/scripts/prisma-v7-readiness.cjs`) inventories package/schema/config prerequisites and legacy Prisma imports in application source under `src/`. That is necessary but not sufficient for an executable migration: JSMKC also has Jest setup, tests, E2E/tooling, and Next.js bundling configuration that refer to the legacy `@prisma/client` package surface.

A companion read-only probe inventories that support-code surface:

```bash
cd smkc-score-app
node scripts/prisma-v7-support-surface.cjs
node scripts/prisma-v7-support-surface.cjs --json
```

The probe scans these bounded targets only:

- `__tests__/`
- `__mocks__/`
- `e2e/`
- `jest.setup.js`
- `jest.config.ts`
- `next.config.ts`

It recognizes static imports, dynamic imports / `require()`, Jest module targets such as `jest.mock()` and `jest.requireActual()`, and `@prisma/client` entries in Next.js `serverExternalPackages`. It does not scan `node_modules`, generated output, or the whole working tree, so running it after `npm ci` does not expand into dependency contents.

## Why this is separate from application readiness

Prisma 7's `prisma-client` generator uses an explicit generated-client output path. Migrating application imports under `src/` is therefore only one part of the change. The test harness currently mocks the package-level Prisma client, tests may import runtime subpaths directly, and Next.js currently externalizes `@prisma/client`. Those references must be reviewed alongside the generated-client import migration or CI/build failures can appear after the application source itself has been converted.

The support-surface probe intentionally does **not** rewrite those references. In particular, it does not guess the final generated-client path, change Jest mocking semantics, or remove Next.js externalization without a verified Cloudflare/OpenNext build. Those are migration-PR decisions.

## Relationship to #3114

#3114 can only remove the temporary `deepmerge-ts` audit exception after a safe forward Prisma release is adopted and the vulnerable dependency edge disappears from the installed graph. Prisma 7 contains that upstream remediation, but the major-version migration remains a coordinated change.

Use both read-only probes before that migration PR:

```bash
cd smkc-score-app
node scripts/prisma-v7-readiness.cjs
node scripts/prisma-v7-support-surface.cjs
```

The migration PR should then update the package set, generator/configuration, application imports, support-code references, generated client, and relevant build configuration together. It must verify Prisma generation/type checking, unit tests, lint/format, Prisma/D1 migration parity, Cloudflare/OpenNext build, representative D1 preview reads/writes, and finally `npm audit --audit-level=high` before removing the #3114 exception.
