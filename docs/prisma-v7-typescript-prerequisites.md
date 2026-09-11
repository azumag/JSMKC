# Prisma 7 TypeScript prerequisites for #3114

The Prisma 7 upgrade guide requires TypeScript 5.4.0 or newer and shows `strict: true` plus `esModuleInterop: true` alongside the ESM compiler settings already tracked by the main Prisma 7 readiness probe.

JSMKC already satisfies these TypeScript-side prerequisites today. They are intentionally staged and regression-tested before any Prisma major-version change so the eventual dependency migration does not combine an unrelated TypeScript compiler-policy change with the database/client migration.

## Read-only probe

From `smkc-score-app`:

```bash
node scripts/prisma-v7-typescript-prereqs.cjs
```

The probe reads only:

- `node_modules/typescript/package.json` for the installed TypeScript version
- `tsconfig.json` for `strict` and `esModuleInterop`

It does not install or update packages, edit TypeScript configuration, generate Prisma Client, change D1, or modify the temporary #3114 audit exception.

The probe reports migration blockers when:

- the installed TypeScript release is older than 5.4.0 or cannot be identified as a stable semantic version
- `compilerOptions.strict` is not explicitly `true`
- `compilerOptions.esModuleInterop` is not explicitly `true`

A repository-level Jest test runs the same inspection against the actual installed TypeScript package and current `tsconfig.json`, so a future dependency or compiler-configuration change cannot silently remove these already-satisfied Prisma 7 prerequisites.

## Relationship to the main readiness probe

`smkc-score-app/scripts/prisma-v7-readiness.cjs` remains the primary migration inventory for the Prisma package set, Node.js runtime, schema/config migration, generated-client imports, and ESM compiler target/module settings. This companion check covers the TypeScript minimum-version and compiler-policy requirements that were not previously guarded explicitly.

The eventual Prisma 7 migration must still be handled as one coherent major-version change. Passing this TypeScript check does not authorize upgrading Prisma, removing the #3114 exception, or applying a consumer-side `deepmerge-ts` major override.

Reference: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
