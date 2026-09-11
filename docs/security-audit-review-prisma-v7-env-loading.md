# Prisma 7 environment-loading evidence in security review

Issue #3114 keeps a temporary audit exception active until a safe Prisma remediation can be validated. Prisma ORM 7 also changes the CLI environment-loading contract: `.env` files are no longer loaded implicitly, so the repository must preserve explicit loading in `prisma.config.ts` during a future major migration.

The read-only probe `smkc-score-app/scripts/prisma-v7-env-loading.cjs` verifies that `prisma.config.ts` explicitly initializes `dotenv` before datasource configuration is evaluated. The current JSMKC config already loads `.env.local` and then `.env`, so this is migration evidence rather than a runtime behavior change.

The manual `Security audit review` workflow runs this probe with `if: always()` and `continue-on-error: true`, alongside the existing Prisma 7 readiness, TypeScript prerequisite, support-code, and ESM probes. Its GitHub Actions outcome is included in the Job Summary so reviewers can distinguish a successful readiness observation from a probe failure without having to inspect individual step logs.

This evidence remains advisory only. It is deliberately not connected to `compatible_upstream_gate`, does not install the application dependency tree, does not edit environment files or secrets, does not change Prisma versions or the lockfile, and cannot add, extend, or remove the #3114 audit exception. A Prisma 7 upgrade still requires an explicit dependency-migration PR and the full Cloudflare/OpenNext and real preview D1 validation described in `docs/prisma-v7-migration-readiness.md`.
