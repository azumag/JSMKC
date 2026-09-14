# Prisma 7 deferred environment-loading guard

Issue #3114 keeps a temporary audit exception active while JSMKC prepares a safe Prisma 7 migration. Prisma 7 also requires explicit environment loading for CLI commands, so `prisma.config.ts` must load dotenv values during module initialization rather than merely contain a `config()` call somewhere in the file.

## Why default parameters are rejected

Default parameter initializers are deferred until the function is invoked:

```ts
import { config } from 'dotenv';

function buildConfig(env = config()) {
  return env;
}
```

The same applies to parenthesized arrow functions:

```ts
import dotenv from 'dotenv';

const buildConfig = (env = dotenv.config()) => env;
```

Neither form proves that dotenv ran before Prisma evaluates `defineConfig(...)`. The repository therefore treats dotenv loading from function or parenthesized-arrow parameter lists as an unsafe migration surface.

## Guard

Run from `smkc-score-app`:

```bash
node scripts/prisma-v7-env-loading-deferred-params.cjs
```

The guard is read-only. It recognizes the dotenv binding styles already supported by `prisma-v7-env-loading.cjs`:

- ESM named imports such as `import { config as loadEnv } from 'dotenv'`
- ESM namespace/default bindings such as `import dotenv from 'dotenv'`
- immutable CommonJS destructuring/namespace bindings already exposed by the primary probe helpers
- direct bare CommonJS `require('dotenv').config()`

It then checks whether any recognized loading call appears inside a `function (...)` parameter list or a parenthesized arrow parameter list `( ... ) =>`. Findings make the command exit non-zero.

The guard deliberately does **not** reinterpret function bodies, control flow, helper invocation order, environment precedence, Prisma package versions, the lockfile, D1 bindings, or the #3114 audit exception. Those remain the responsibility of the existing Prisma 7 readiness probes and migration review.

## CI contract

`__tests__/scripts/prisma-v7-env-loading-deferred-params.test.ts` covers named ESM bindings, namespace/default bindings, direct CommonJS loading, quoted examples, helper-body calls, and the repository's real `prisma.config.ts`.

Because the normal unit-test suite reads the real config and requires zero findings, a future refactor that moves dotenv loading into a deferred default parameter will fail CI even if the primary readiness probe would otherwise misclassify that source shape.

The current `prisma.config.ts` remains on the simple module-initialization pattern:

```ts
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  // ...
});
```

No dependency, schema, generated-client, Cloudflare, D1, secret, or runtime behavior is changed by this guard.
