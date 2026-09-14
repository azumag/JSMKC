# Prisma 7 environment-loading template interpolation guard

Issue #3417 hardens the temporary Prisma 7 migration-readiness checks tracked by #3114.

The primary environment-loading probe intentionally treats template literals conservatively when deciding whether a `config()` call is definitely executed before Prisma configuration evaluation. A future refactor that evaluates `defineConfig(...)` from inside `${ ... }` could otherwise hide the real evaluation boundary from that probe and make a later dotenv call look safe.

This repository does not need `defineConfig(...)` inside template interpolation, so CI protects that invariant instead of expanding the primary probe into a full JavaScript data-flow evaluator.

## Guard

Run from `smkc-score-app`:

```bash
node scripts/prisma-v7-env-loading-template-guard.cjs
```

Use `--json` for machine-readable output.

The guard detects executable `defineConfig(...)` calls inside template interpolation for:

- named ESM imports, including aliases;
- CommonJS destructuring aliases;
- ESM namespace imports such as `prismaConfig.defineConfig(...)`;
- CommonJS namespace bindings.

The scanner is lexical and reuses the Prisma ESM migration-surface rules for comments, strings and regular-expression literals. Raw template text, ordinary quoted examples, comments and regex bodies are therefore not findings. Nested template interpolation is tracked independently.

Any finding is fail-closed: the CLI exits non-zero and the unit-test invariant fails. The repository's current `prisma.config.ts` must remain at zero findings.

## CI coverage

`__tests__/scripts/prisma-v7-env-loading-template-guard.test.ts` covers named ESM aliases, CommonJS aliases, namespace calls, ignored non-executable examples, nested template interpolation, and the real repository config.

This guard does not change dependency versions, the lockfile, Prisma schema/runtime, environment-file precedence, D1/Cloudflare bindings, secrets, or the temporary #3114 audit exception. It only prevents a syntactic refactor that would make readiness evidence ambiguous.
