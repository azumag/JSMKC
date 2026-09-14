# Prisma 7 environment loading readiness

Prisma ORM 7 no longer loads `.env` files automatically for Prisma CLI commands. A migration can therefore appear structurally complete while commands that depend on `DATABASE_URL` stop seeing the same environment values they used under Prisma 6.

JSMKC already loads environment files explicitly in `prisma.config.ts`:

1. `.env.local`
2. `.env`

That ordering is intentional and must be preserved during the Prisma 7 migration unless the deployment/environment strategy is deliberately changed.

## Read-only probe

Run from `smkc-score-app`:

```bash
node scripts/prisma-v7-env-loading.cjs
```

The probe accepts the Prisma upgrade-guide side-effect import:

```ts
import 'dotenv/config';
```

Static side-effect imports execute before the module body, so that form is sufficient regardless of where the import declaration is written at top level.

The probe also accepts explicit `dotenv` `config()` calls, including JSMKC's current named-import pattern, but only when the detected call is a top-level executed call before the `defineConfig(...)` expression is evaluated. A `config()` call that appears after `export default defineConfig(...)`, inside a helper function or concise arrow body, or only as quoted example text is intentionally rejected because it does not prove that environment loading occurred before datasource values were read. Aliased `defineConfig` imports are handled as the same evaluation boundary, including CommonJS destructuring such as `const { defineConfig: makeConfig } = require('prisma/config')`.

For concise arrow functions, the lexical probe remains deliberately conservative until the surrounding top-level statement is terminated. This favors a false-negative migration-readiness result over accepting a `config()` call that is merely stored for later execution.

Brace-less control-flow bodies are also treated conservatively. A `config()` call that is the single-statement body of `if` / `else` / `for` / `while` / `do` is conditional or repeated rather than unconditional initialization, so it cannot satisfy readiness. Once that control-flow statement has completed, a later direct top-level `config()` can still qualify. When multiple matching calls exist, the probe continues looking after non-qualifying calls instead of treating the first textual match as decisive.

Expression-level conditional execution follows the same fail-closed rule. A `config()` call on the right side of `&&`, `||`, `??`, optional/ternary `?`, or another branch that is not guaranteed to execute cannot satisfy readiness. A call that appears before such an operator still qualifies because its evaluation is unconditional, and a later direct top-level call can qualify after the conditional statement has terminated.

Comment masking is lexical rather than regex-only: comment delimiters inside quoted strings are preserved, while real comments are replaced without changing source length or line positions. Import evidence is also required to be lexically top level, so examples embedded in multiline template literals cannot satisfy readiness checks.

Imports that never invoke `config()` and commented examples do not count as readiness evidence.

The probe does not edit `prisma.config.ts`, `.env*` files, dependency versions, the lockfile, Prisma schema, generated client code, D1 configuration, or the temporary #3114 security-audit exception.

## Regression coverage

`__tests__/scripts/prisma-v7-env-loading.test.ts` verifies the supported loading styles, correct and too-late `config()` ordering, helper/concise-arrow/quoted non-execution cases, ESM and CommonJS aliased `defineConfig` usage, and the repository's actual `prisma.config.ts`. `__tests__/scripts/prisma-v7-env-loading-control-flow.test.ts` verifies fail-closed handling for brace-less conditional/loop bodies and confirms that a later unconditional call can still qualify. `__tests__/scripts/prisma-v7-env-loading-conditional-expressions.test.ts` covers short-circuit, ternary and nullish conditional execution while preserving unconditional left-hand calls. `__tests__/scripts/prisma-v7-env-loading-lexical-comments.test.ts` adds coverage for comment delimiters inside strings, real comment masking, and fake import examples inside template literals. If a future Prisma 7 migration rewrite accidentally removes explicit environment loading or moves it after config evaluation, the normal unit-test suite will fail before that change can be merged.

This is migration-readiness evidence only. It does not authorize changing environment precedence, introducing new secrets, or changing Cloudflare runtime bindings.
