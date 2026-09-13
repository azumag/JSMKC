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

It checks the application client path in `src/lib/prisma.ts` for six independent pieces of evidence:

1. `PrismaD1` is imported from `@prisma/adapter-d1`.
2. The imported D1 adapter is actually constructed.
3. A Prisma client is created with an `adapter` option that references that constructed adapter.
4. The Prisma client options do not retain the Prisma 6 `datasources` connection override.
5. The Prisma client options do not retain the Prisma 6 `datasourceUrl` connection override.
6. The Prisma client options do not contain an unresolved object spread such as `...legacyOptions`.

The last three checks prevent a false-positive `ready` result when adapter wiring has been added but legacy constructor-level connection configuration has not been removed. Prisma's v7 upgrade guidance moves direct database connectivity to driver adapters and shows the old `datasources` / `datasourceUrl` constructor shape as the pre-v7 form. Because this probe deliberately avoids executing application code, it cannot safely prove what an arbitrary spread object contributes to the Prisma client options; any such spread therefore fails closed until its properties are explicit.

The constructor option extractor walks balanced object braces instead of stopping at the first text that looks like `})`. This matters for legitimate nested option expressions such as `configureLogging({ level: 'error' })`: a later `datasourceUrl`, `datasources`, or object spread must still be included in the inspected Prisma client options rather than being hidden behind an earlier nested call boundary. String and template literal contents are skipped while matching braces so braces used only as text do not truncate the evidence.

The probe intentionally does not require the Prisma client import to remain `@prisma/client`; the Prisma 7 migration is expected to move that import to the explicit generated-client output path. Named import aliases are accepted for both the adapter and Prisma client so refactors do not create false migration blockers.

A unit test also runs the probe against the repository's real `src/lib/prisma.ts`. This means a future dependency or generated-client migration cannot accidentally remove the D1 adapter wiring, reintroduce a legacy Prisma 6 connection override, or conceal constructor options behind an unresolved spread while still reporting the D1 client path as ready.

This is migration evidence only. It does not change the current Prisma 6 runtime, package versions, lockfile, schema, D1 binding, Cloudflare deployment configuration, or the temporary audit exception tracked by #3114.
