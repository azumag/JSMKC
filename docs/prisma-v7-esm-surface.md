# Prisma 7 ESM migration surface for #3114

Prisma ORM 7 is ESM-first, and the existing migration readiness check records top-level `"type": "module"` as one of the changes that must be handled in the explicit major-version migration. JSMKC also has Node-executed helper and E2E files with a `.js` extension that currently use CommonJS APIs. Turning on top-level ESM without accounting for those files would make unprotected `.js` files become ES modules and can break `require`, `module.exports`, `exports`, `__dirname`, and `__filename` usage.

To keep that migration work visible without changing runtime behavior, the repository has a read-only inventory:

```bash
cd smkc-score-app
node scripts/prisma-v7-esm-surface.cjs
node scripts/prisma-v7-esm-surface.cjs --json
```

The probe scans Node/test support surfaces (`scripts`, `e2e`, `__tests__`, and `__mocks__`) plus the legacy root `jest.setup.js` path and reports `.js` files that contain CommonJS loads/exports or CommonJS-only Node globals and would change interpretation under a future top-level ESM switch. Comments and quoted/template string contents are masked before matching so prose-only mentions do not become migration work.

Files beneath a nested package scope with explicit `"type": "commonjs"` are intentionally excluded because Node will continue to interpret their `.js` files as CommonJS after the application package switches to ESM. Existing `.cjs` files are excluded for the same reason.

The probe intentionally does **not** edit files, rename extensions, add top-level `"type": "module"`, install packages, regenerate Prisma Client, or change the #3114 audit exception.

## Current evidence

Current `main` has large, deliberately CommonJS support-code families under `scripts/`, `e2e/`, and `__mocks__/`. Converting all of those helpers to ESM in the same Prisma dependency migration would create a large unrelated blast radius, so those directories carry narrow package scopes with explicit `"type": "commonjs"`.

The root Jest setup is also deliberately CommonJS. It is named `jest.setup.cjs`, and `jest.config.ts` references that explicit `.cjs` entry. This removes the Jest setup from the future top-level ESM `.js` migration surface without rewriting its mocks, polyfills, or runtime behavior. The separate Prisma support-surface probe continues to scan the `.cjs` setup for legacy `@prisma/client` references, because an explicit CommonJS boundary does not remove the Prisma import migration work.

These are behavior-preserving preparation steps: the application package is still CommonJS-by-default today, while the nested declarations and `.cjs` extension make the intended helper runtime mode explicit before a future top-level `"type": "module"` switch. The ESM-surface probe understands those explicit boundaries and therefore reports only CommonJS `.js` files that would actually change interpretation when top-level ESM is enabled.

The remaining reported files are genuine migration surface. For each one, the explicit Prisma 7 migration can choose the least disruptive compatible option:

1. convert the helper to ESM imports/exports and replace CommonJS-only globals where needed;
2. rename a deliberately CommonJS helper to `.cjs` and update its callers/scripts; or
3. add a narrower CommonJS package scope when there is a concrete tooling reason and that boundary is tested.

The inventory does not mechanically choose among those options because executable entry points, Jest behavior, and operational scripts can have different requirements.

## Migration boundary

Before enabling top-level `"type": "module"` in the Prisma 7 migration PR:

- run this inventory and review every remaining reported `.js` helper;
- preserve the explicit CommonJS scopes for `scripts/`, `e2e/`, and `__mocks__/` and the explicit `jest.setup.cjs` entry unless those helpers are deliberately migrated to ESM;
- preserve or deliberately update every package script and relative helper import that points at a renamed file;
- run unit tests, the security-audit helpers, Prisma generate, and Cloudflare/OpenNext build;
- run representative E2E/preview paths for any changed E2E helper chain;
- keep the #3114 audit exception until the Prisma dependency graph itself no longer contains the vulnerable `deepmerge-ts` edge and the full migration is verified.

The manual `Security audit review` workflow records this ESM surface as advisory evidence alongside the Prisma 7 package/schema/import readiness and support-code Prisma reference inventory. It is intentionally outside the compatible-range fail-closed gate.
