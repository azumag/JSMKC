# Prisma 7 `defineConfig` re-alias guard

Issue #3114 keeps a temporary Prisma-related security exception active while the repository prepares a safe forward migration. The Prisma 7 environment-loading readiness probe verifies that dotenv loading runs before Prisma config evaluation.

The readiness probe tracks `defineConfig` names imported directly from `prisma/config` and namespace calls such as `prismaConfig.defineConfig(...)`. A second top-level assignment can hide that evaluation boundary from a lexical probe:

```ts
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const makeConfig = defineConfig;
export default makeConfig({});
config();
```

The actual Prisma config evaluation happens before `config()`, so accepting the later dotenv call would be fail-open.

## Repository policy

`prisma.config.ts` must call the binding imported from `prisma/config` directly. Do not create a top-level `const`, `let`, or `var` alias for:

- a named `defineConfig` import or CommonJS destructuring binding;
- `namespace.defineConfig` from an ESM/CommonJS `prisma/config` namespace;
- another alias of either form.

`scripts/prisma-v7-defineconfig-alias-guard.cjs` enforces that rule and follows simple alias chains transitively. Mutable aliases are rejected too: proving that a `let` or `var` binding was not reassigned before evaluation would require substantially more data-flow analysis, so the guard intentionally favors false negatives over a fail-open readiness result.

Quoted examples, comments, and aliases declared inside nested helper bodies are not treated as top-level re-aliases.

The unit test suite also runs the guard against the repository's actual `prisma.config.ts`, so introducing this unsupported pattern fails CI before merge.

This guard does not change dependency versions, the lockfile, Prisma runtime behavior, dotenv precedence, Cloudflare/D1 bindings, secrets, or the temporary audit exception tracked by #3114.
