# Prisma 7 bare `require` binding guard

Issue #3114 keeps a temporary Prisma-related security exception active while the repository prepares a safe forward migration. The Prisma 7 environment-loading readiness probe accepts a bare CommonJS call such as `require('dotenv').config()` as explicit environment loading.

A bare identifier is only trustworthy when it still refers to the module loader. A local module-scope binding or reassignment can make the same source shape fail-open:

```ts
const require = () => ({ config() {} });
require('dotenv').config();
```

The second line looks like CommonJS dotenv loading to a lexical probe, but it never loads dotenv.

Conditional module execution has the same problem. A reassignment inside `if`, `switch`, loop, or `try` can replace the loader before a later bare `require('dotenv')` call even though the reassignment is nested inside a control-flow body:

```ts
if (useFakeLoader) {
  require = fakeRequire;
}
require('dotenv').config();
```

## Repository policy

`prisma.config.ts` must not create or replace the module-scope binding named `require`.

`scripts/prisma-v7-require-binding-guard.cjs` rejects the supported rebinding shapes used by repository code and configuration files:

- top-level `const`, `let`, or `var` bindings named `require`;
- top-level object/array destructuring that binds a local name `require`;
- top-level ESM import bindings named `require`;
- top-level function or class declarations named `require`;
- direct assignment, compound assignment, or update of bare `require` at module execution scope;
- the same assignments inside braced or unbraced module control flow, including `if`/`else`, loops, `switch`, `try`/`catch`/`finally`, and class static initialization.

Direct CommonJS calls such as `require('dotenv')` remain allowed. Member methods and properties such as `loader.require(...)` / `loader.require = ...`, quoted examples, comments, and assignments inside nested function, arrow, constructor, or class method bodies are not treated as module-scope loader rebindings.

The conditional-assignment check uses the TypeScript parser already present in the repository toolchain. This lets the guard distinguish executable module syntax from comments, strings, regular expressions, member expressions, and nested function-like scopes without weakening the stricter lexical readiness probe itself.

The guard is intentionally fail-closed. The repository already uses ESM imports for dotenv in `prisma.config.ts`, so there is no current need to shadow or replace `require`. If a future migration genuinely needs a custom loader, its semantics should be reviewed explicitly rather than silently weakening the environment-loading readiness result.

The unit test suite runs the guard against the repository's actual `prisma.config.ts`, so introducing one of these unsupported patterns fails CI before merge.

This guard does not change dependency versions, the lockfile, Prisma runtime/schema behavior, dotenv precedence, Cloudflare/D1 bindings, secrets, or the temporary audit exception tracked by #3114.
