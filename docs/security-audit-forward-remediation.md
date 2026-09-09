# #3114 forward-remediation readiness

This note documents how to recognize a safe forward-remediation candidate for the temporary `deepmerge-ts` audit exception tracked in #3114.

## Upstream state checked on 2026-09-10

Prisma upstream merged `prisma/orm#30189` into the `v7` branch on 2026-09-01. That change updates `@prisma/config` from `deepmerge-ts` 7.1.5 to 8.0.2. The latest stable Prisma 7 release visible when this note was written is 7.10.0, released on 2026-08-25, so it predates that merge. JSMKC therefore must not assume that a currently installable stable Prisma package already contains the fix.

References:

- https://github.com/prisma/orm/issues/30052
- https://github.com/prisma/orm/pull/30189
- https://github.com/prisma/orm/releases/tag/7.10.0

## Status classification

`smkc-score-app/scripts/security-audit-status.js` remains fail-closed. The current vulnerable lock context reports `active`. Arbitrary dependency drift reports `context-changed`.

A new `forward-remediation-candidate` state is reported only when both of these lockfile facts move to the patched line:

1. the installed `node_modules/deepmerge-ts` version is semver `>= 8.0.0`; and
2. the `node_modules/@prisma/config` dependency edge itself requests a simple patched `deepmerge-ts` version/range.

This deliberately does not classify a consumer-side override as a forward-remediation candidate. For example, if the installed package is forced to 8.0.2 while `@prisma/config` still declares `deepmerge-ts: 7.1.5`, the status stays `context-changed`.

The classifier accepts only simple exact, caret, tilde, or lower-bound requirements that can be compared safely. Complex or workspace ranges are not guessed and remain generic context drift.

## Required action when the candidate appears

`forward-remediation-candidate` still exits non-zero. It is evidence that the dependency graph may now contain the upstream fix, not proof that #3114 can be closed.

Before removing the temporary exception:

1. run the canonical `node scripts/security-audit.js` path with the pinned npm runtime;
2. confirm GHSA-ggr8-5vv4-36mx is absent from the actual audit report;
3. run unit tests, lint, changed-file formatting, Prisma/D1 migration parity, and the Cloudflare build gate; and
4. remove the #3114 temporary allowlist only in the same reviewed change that records the verified forward dependency versions.

This keeps the existing policy distinction between "dependency context changed" and "security issue confirmed remediated" while making a genuine upstream dependency-edge update immediately visible to automation and maintainers.
