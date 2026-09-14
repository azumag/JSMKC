# Security audit CLI diagnostic safety

The security-audit CLI entrypoints treat diagnostic text as untrusted whenever it can originate from command-line arguments, package metadata, JSON parser failures, npm subprocesses, registry responses, or GitHub Actions output handling.

## Boundary

Top-level failures in these entrypoints must pass through `smkc-score-app/scripts/security-audit-upstream-diagnostic.js` before being written to stderr:

- `security-audit.js`
- `security-audit-status.js`
- `security-audit-upstream.js`
- `security-audit-next-major.js`

The same boundary is also applied to auxiliary audit and Prisma 7 review entrypoints. The #3446 hardening covers:

- `security-audit-lockfile.js`
- `verify-npm-version.js`
- `prisma-v7-review-json.cjs`
- `prisma-v7-readiness.cjs`
- `prisma-v7-driver-adapter.cjs`
- `prisma-v7-typescript-prereqs.cjs`
- `prisma-v7-removed-surfaces.cjs`
- `prisma-v7-support-surface.cjs`
- `prisma-v7-esm-surface.cjs`
- `prisma-v7-env-loading.cjs`
- `prisma-v7-defineconfig-alias-guard.cjs`
- `prisma-v7-env-loading-template-guard.cjs`
- `prisma-v7-env-loading-deferred-params.cjs`
- `prisma-v7-require-binding-guard.cjs`

The #3446 re-inventory is complete: the primary environment-loading probe and its guard helpers now route top-level failure diagnostics through the same boundary.

The shared formatter only extracts messages from `Error` instances or strings. Unexpected thrown objects are not coerced with `String()` or `toString()`. This keeps hostile object coercion from becoming part of error handling.

The sanitizer makes C0/C1 controls, Unicode line separators, and bidi-control characters visible, trims the resulting text, and caps a diagnostic message at 500 characters. Each formatted failure is therefore emitted as one bounded stderr line.

The core audit runner also sanitizes `npm audit` stderr before forwarding it. Valid `npm audit --json` stdout is still preserved when the parsed report is rejected because that JSON is the evidence needed to diagnose a fail-closed policy decision.

## Non-goals

This hardening does not change:

- the temporary #3114 advisory exception or its deadline;
- the pinned dependency/lockfile identity checks;
- registry selection or remediation-candidate logic;
- Prisma 7 readiness/evidence semantics;
- GitHub Actions output contracts;
- the success-path status text.

A change to any of those contracts needs separate review and tests.