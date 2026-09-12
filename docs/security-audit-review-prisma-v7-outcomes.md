# Prisma 7 advisory probe outcomes in the #3114 review

The manual `Security audit review` workflow collects seven local Prisma 7 migration probes after the compatible and next-major upstream checks:

- `prisma-v7-readiness.cjs`
- `prisma-v7-driver-adapter.cjs`
- `prisma-v7-typescript-prereqs.cjs`
- `prisma-v7-env-loading.cjs`
- `prisma-v7-removed-surfaces.cjs`
- `prisma-v7-support-surface.cjs`
- `prisma-v7-esm-surface.cjs`

These probes are deliberately advisory. Each step uses `continue-on-error: true`, because a parser or migration-surface failure must not silently change the meaning of the current-compatible Prisma remediation gate. The only automated gate remains `compatible_upstream_gate`, which evaluates the current manifest range.

The D1 driver-adapter probe keeps the Prisma 7 runtime wiring visible without changing dependencies or generated artifacts. It checks that the repository's Prisma client construction still uses the D1 adapter surface expected by the explicit major-version migration.

The TypeScript prerequisite probe is also intentionally install-free on this workflow. The review does not run `npm ci`; when `node_modules/typescript/package.json` is absent, the probe reads the pinned TypeScript version from `package-lock.json` and records that evidence source in its report. This keeps the review read-only while still making the Prisma 7 TypeScript minimum and compiler-policy prerequisites observable.

The environment-loading and removed-surface probes keep two migration risks visible without changing runtime behavior. The environment probe verifies that Prisma CLI configuration initializes dotenv explicitly, while the removed-surface probe inventories APIs, preview features, and CLI flags that Prisma 7 removes. Both remain evidence only: a clean result is not permission to upgrade dependencies or remove the #3114 exception.

The Job summary must still make advisory probe failures visible. The main check table therefore records the GitHub Actions outcome for all seven Prisma 7 probes in addition to the lockfile, exception-status, canonical-audit, compatible-upstream, and next-major checks. This distinguishes two different situations that would otherwise look similar in a saved summary: a probe successfully reporting migration blockers, and a probe failing before it could produce trustworthy evidence.

For machine-readable local evidence, `npm run prisma:v7:review:json` executes the same seven probe scripts in their JSON modes and returns a single fail-closed aggregate object. That command is evidence-only as well and does not alter the compatible remediation gate.

A failed Prisma 7 advisory probe is not permission to upgrade Prisma, remove the #3114 exception, or weaken the audit policy. Review the failing probe, restore its evidence collection, and keep the explicit major-migration validation boundary documented in `prisma-v7-migration-readiness.md`.
