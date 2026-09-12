# Prisma 7 D1 driver adapter readiness

Prisma ORM 7 requires database clients to use a driver adapter. JSMKC already uses Cloudflare D1 through `@prisma/adapter-d1`, so the migration should preserve that wiring while the Prisma packages, generated client provider, and import paths move to their Prisma 7 forms.

The read-only probe lives at:

```bash
cd smkc-score-app
npm run prisma:v7:driver-adapter
```

For automation or other machine consumers, the same evidence is available as a single JSON object:

```bash
npm run prisma:v7:driver-adapter:json
```

The JSON mode reports the same `ready`, detected local names, and per-check booleans as the human-readable mode. It does not write Markdown to `GITHUB_STEP_SUMMARY`; unsupported CLI arguments fail instead of being ignored.

It checks the application client path in `src/lib/prisma.ts` for three independent pieces of evidence:

1. `PrismaD1` is imported from `@prisma/adapter-d1`.
2. The imported D1 adapter is actually constructed.
3. A Prisma client is created with an `adapter` option.

The probe intentionally does not require the Prisma client import to remain `@prisma/client`; the Prisma 7 migration is expected to move that import to the explicit generated-client output path. Named import aliases are accepted for both the adapter and Prisma client so refactors do not create false migration blockers.

A unit test also runs the probe against the repository's real `src/lib/prisma.ts`. This means a future dependency or generated-client migration cannot accidentally remove the D1 adapter wiring while still leaving the package installed.

This is migration evidence only. It does not change the current Prisma 6 runtime, package versions, lockfile, schema, D1 binding, Cloudflare deployment configuration, or the temporary audit exception tracked by #3114.
