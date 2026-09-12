# Prisma 7 TypeScript prerequisites for #3114

The Prisma 7 upgrade guide requires TypeScript 5.4.0 or newer and shows `strict: true` plus `esModuleInterop: true` alongside the ESM compiler settings already tracked by the main Prisma 7 readiness probe.

JSMKC already satisfies these TypeScript-side prerequisites today. They are intentionally staged and regression-tested before any Prisma major-version change so the eventual dependency migration does not combine an unrelated TypeScript compiler-policy change with the database/client migration.

## Read-only probe

From `smkc-score-app`:

```bash
npm run prisma:v7:typescript-prereqs
```

For machine-readable evidence, use:

```bash
npm run prisma:v7:typescript-prereqs:json
```

The JSON command returns the same readiness object as one JSON line and does not append Markdown to `GITHUB_STEP_SUMMARY`. Unknown CLI options fail instead of being ignored, so automation cannot accidentally request a mode that the probe does not support.

The probe reads only:

- `node_modules/typescript/package.json` when dependencies are already installed;
- otherwise `package-lock.json` at `packages["node_modules/typescript"].version`, so the manual read-only security review can collect the same minimum-version evidence without running `npm ci`;
- `tsconfig.json` for `strict` and `esModuleInterop`.

The report identifies which TypeScript version source was used. If an installed TypeScript manifest exists, it is preferred over lockfile evidence. A malformed installed manifest is treated as an inspection failure instead of being silently hidden by the lockfile fallback.

It does not install or update packages, edit TypeScript configuration, generate Prisma Client, change D1, or modify the temporary #3114 audit exception.

The probe reports migration blockers when:

- the observed TypeScript release is older than 5.4.0 or cannot be identified as a stable semantic version;
- `compilerOptions.strict` is not explicitly `true`;
- `compilerOptions.esModuleInterop` is not explicitly `true`.

Repository-level Jest coverage validates both evidence paths and also checks the current repository lockfile plus `tsconfig.json`, so dependency-install state cannot decide whether the Prisma 7 prerequisite check is runnable.

## Security audit review integration

The manual `Security audit review` workflow intentionally does not install the dependency tree. It runs this probe with `continue-on-error: true` after the main Prisma 7 readiness inventory and records the probe outcome in the Job summary. On that path, the probe normally uses `package-lock.json` as the TypeScript version evidence source.

This outcome is advisory only. It is not passed to `compatible_upstream_gate`, does not authorize a Prisma major upgrade, and does not change the current-compatible remediation decision for #3114.

## Relationship to the main readiness probe

`smkc-score-app/scripts/prisma-v7-readiness.cjs` remains the primary migration inventory for the Prisma package set, Node.js runtime, schema/config migration, generated-client imports, and ESM compiler target/module settings. This companion check covers the TypeScript minimum-version and compiler-policy requirements that were not previously guarded explicitly.

The eventual Prisma 7 migration must still be handled as one coherent major-version change. Passing this TypeScript check does not authorize upgrading Prisma, removing the #3114 exception, or applying a consumer-side `deepmerge-ts` major override.

Reference: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
