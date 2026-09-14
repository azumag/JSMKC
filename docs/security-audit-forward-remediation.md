# #3114 forward-remediation readiness

This note documents how to recognize a safe forward-remediation candidate for the temporary `deepmerge-ts` audit exception tracked in #3114.

## Upstream state checked on 2026-09-14

Prisma upstream issue `prisma/orm#30052` is still open. The upstream change that moves `@prisma/config` to `deepmerge-ts` 8.x exists on the Prisma 8 development line, but JSMKC must not infer from that alone that its currently supported Prisma line has a safe forward release. The temporary exception therefore remains active until an installable forward dependency graph is verified by the canonical audit and the full repository gates.

References:

- https://github.com/prisma/orm/issues/30052
- https://github.com/prisma/orm/pull/30189
- https://github.com/prisma/orm/releases

## Status classification

`smkc-score-app/scripts/security-audit-status.js` remains fail-closed. The current vulnerable lock context reports `active`. Arbitrary dependency drift reports `context-changed`.

A new `forward-remediation-candidate` state is reported only when both of these lockfile facts move to the patched line:

1. the installed `node_modules/deepmerge-ts` version is complete SemVer `>= 8.0.0`; and
2. the `node_modules/@prisma/config` dependency edge itself requests a simple patched `deepmerge-ts` version/range whose version token is also complete SemVer.

This deliberately does not classify a consumer-side override as a forward-remediation candidate. For example, if the installed package is forced to 8.0.2 while `@prisma/config` still declares `deepmerge-ts: 7.1.5`, the status stays `context-changed`.

The classifier accepts only simple exact, caret, tilde, or lower-bound requirements that can be compared safely. Complex or workspace ranges are not guessed and remain generic context drift. SemVer validation is also fail-closed: core identifiers may not contain leading zeroes, numeric prerelease identifiers may not contain leading zeroes, prerelease/build identifiers may not be empty, and consecutive dots are rejected. Valid prerelease/build metadata remains supported. This prevents malformed values such as `9.0.0-01`, `9.0.0-..`, or `^9.0.0-alpha..1` from being mistaken for evidence that the patched dependency line has arrived.

## Required action when the candidate appears

`forward-remediation-candidate` still exits non-zero. It is evidence that the dependency graph may now contain the upstream fix, not proof that #3114 can be closed.

Before removing the temporary exception:

1. run the canonical `node scripts/security-audit.js` path with the pinned npm runtime;
2. confirm GHSA-ggr8-5vv4-36mx is absent from the actual audit report;
3. run unit tests, lint, changed-file formatting, Prisma/D1 migration parity, and the Cloudflare build gate; and
4. remove the #3114 temporary allowlist only in the same reviewed change that records the verified forward dependency versions.

This keeps the existing policy distinction between "dependency context changed" and "security issue confirmed remediated" while making a genuine upstream dependency-edge update immediately visible to automation and maintainers.
