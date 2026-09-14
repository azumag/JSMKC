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

Supported explicit dotenv bindings include ESM named imports, ESM namespace imports, ESM default imports, immutable CommonJS destructuring such as `const { config: loadEnv } = require('dotenv')`, immutable CommonJS namespace bindings such as `const dotenv = require('dotenv')`, and the direct `require('dotenv').config()` form. Every discovered named-import alias is checked, so an earlier unused alias cannot hide a later alias that actually performs environment loading. Bound CommonJS evidence is deliberately limited to `const`; `let` and `var` bindings remain fail-closed because the probe does not attempt to prove that a mutable binding was not reassigned before `config()` runs.

Prisma config namespace forms are evaluation boundaries too. Both `import * as prismaConfig from 'prisma/config'; prismaConfig.defineConfig(...)` and `const prismaConfig = require('prisma/config'); prismaConfig.defineConfig(...)` are tracked, and when named and namespace forms coexist the earliest top-level `defineConfig` evaluation wins. This prevents a later `dotenv.config()` from being accepted merely because the first config evaluation used namespace syntax.

For concise arrow functions, the lexical probe remains deliberately conservative until the surrounding top-level statement is terminated. This favors a false-negative migration-readiness result over accepting a `config()` call that is merely stored for later execution.

Brace-less control-flow bodies are also treated conservatively. A `config()` call that is the single-statement body of `if` / `else` / `for` / `while` / `do` is conditional or repeated rather than unconditional initialization, so it cannot satisfy readiness. Once that control-flow statement has completed, a later direct top-level `config()` can still qualify. When multiple matching calls exist, the probe continues looking after non-qualifying calls instead of treating the first textual match as decisive.

Expression-level conditional execution follows the same fail-closed rule. A `config()` call on the right side of `&&`, `||`, `??`, optional/ternary `?`, or another branch that is not guaranteed to execute cannot satisfy readiness. A call that appears before such an operator still qualifies because its evaluation is unconditional, and a later direct top-level call can qualify after the conditional statement has terminated.

Comment masking is lexical rather than regex-only: comment delimiters inside quoted strings are preserved, while real comments are replaced without changing source length or line positions. Import evidence is also required to be lexically top level, so examples embedded in multiline template literals cannot satisfy readiness checks.

JavaScript regular-expression literals are masked before the scope/evaluation scan using the same expression-start rule as the Prisma 7 ESM migration-surface probe. Regex escapes and character classes are tracked through the closing slash while ordinary division remains code. This prevents braces, quotes, semicolons, control-flow-looking text, or comment-like sequences inside a regex from changing lexical scope and accidentally promoting an unexecuted helper `config()` to top-level evidence or hiding a valid direct call.

Imports that never invoke `config()` and commented examples do not count as readiness evidence.

The probe does not edit `prisma.config.ts`, `.env*` files, dependency versions, the lockfile, Prisma schema, generated client code, D1 configuration, or the temporary #3114 security-audit exception.

## Regression coverage

`__tests__/scripts/prisma-v7-env-loading.test.ts` verifies the supported loading styles, correct and too-late `config()` ordering, helper/concise-arrow/quoted non-execution cases, ESM and CommonJS aliased `defineConfig` usage, and the repository's actual `prisma.config.ts`. `__tests__/scripts/prisma-v7-env-loading-dotenv-bindings.test.ts` covers ESM default imports, immutable CommonJS destructuring/namespace bindings, multiple named-import aliases, and fail-closed handling for mutable CommonJS bindings. `__tests__/scripts/prisma-v7-env-loading-control-flow.test.ts` verifies fail-closed handling for brace-less conditional/loop bodies and confirms that a later unconditional call can still qualify. `__tests__/scripts/prisma-v7-env-loading-conditional-expressions.test.ts` covers short-circuit, ternary and nullish conditional execution while preserving unconditional left-hand calls. `__tests__/scripts/prisma-v7-env-loading-prisma-namespace.test.ts` covers ESM/CommonJS Prisma config namespace evaluation boundaries, mixed named/namespace ordering, and valid pre-evaluation environment loading. `__tests__/scripts/prisma-v7-env-loading-lexical-comments.test.ts` adds coverage for comment delimiters inside strings, real comment masking, and fake import examples inside template literals. `__tests__/scripts/prisma-v7-env-loading-regex-literals.test.ts` verifies that regex braces/quotes cannot escape helper scope or hide valid top-level loading evidence while ordinary division remains unchanged. If a future Prisma 7 migration rewrite accidentally removes explicit environment loading or moves it after config evaluation, the normal unit-test suite will fail before that change can be merged.

This is migration-readiness evidence only. It does not authorize changing environment precedence, introducing new secrets, or changing Cloudflare runtime bindings.
