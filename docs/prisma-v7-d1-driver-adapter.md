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

It checks the application client path in `src/lib/prisma.ts` for five independent pieces of evidence:

1. `PrismaD1` is imported from `@prisma/adapter-d1`.
2. The imported D1 adapter is actually constructed.
3. A Prisma client is created with an `adapter` option that references that constructed adapter.
4. The Prisma client options do not retain the Prisma 6 `datasources` connection override.
5. The Prisma client options do not retain the Prisma 6 `datasourceUrl` connection override.

The last two checks prevent a false-positive `ready` result when adapter wiring has been added but legacy constructor-level connection configuration has not been removed. Prisma's v7 upgrade guidance moves direct database connectivity to driver adapters and shows the old `datasources` / `datasourceUrl` constructor shape as the pre-v7 form.

The probe intentionally does not require the Prisma client import to remain `@prisma/client`; the Prisma 7 migration is expected to move that import to the explicit generated-client output path. Named import aliases are accepted for both the adapter and Prisma client so refactors do not create false migration blockers.

A unit test also runs the probe against the repository's real `src/lib/prisma.ts`. This means a future dependency or generated-client migration cannot accidentally remove the D1 adapter wiring or reintroduce a legacy Prisma 6 connection override while still reporting the D1 client path as ready.

This is migration evidence only. It does not change the current Prisma 6 runtime, package versions, lockfile, schema, D1 binding, Cloudflare deployment configuration, or the temporary audit exception tracked by #3114.
