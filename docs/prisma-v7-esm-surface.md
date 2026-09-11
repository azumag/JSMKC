# Prisma 7 ESM migration surface for #3114

Prisma ORM 7 is ESM-first, and the existing migration readiness check records top-level `"type": "module"` as one of the changes that must be handled in the explicit major-version migration. JSMKC also has Node-executed helper and E2E files with a `.js` extension that currently use CommonJS APIs. Turning on top-level ESM without accounting for those files would make Node interpret them as ES modules and can break `require`, `module.exports`, `exports`, `__dirname`, and `__filename` usage.

To keep that migration work visible without changing runtime behavior, the repository has a read-only inventory:

```bash
cd smkc-score-app
node scripts/prisma-v7-esm-surface.cjs
node scripts/prisma-v7-esm-surface.cjs --json
```

The probe scans Node/test support surfaces (`scripts`, `e2e`, `__tests__`, `__mocks__`, and `jest.setup.js`) and reports `.js` files that contain CommonJS loads/exports or CommonJS-only Node globals. Comments and quoted/template string contents are masked before matching so prose-only mentions do not become migration work.

It intentionally does **not** edit files, rename extensions, add `"type": "module"`, install packages, regenerate Prisma Client, or change the #3114 audit exception. Existing `.cjs` files are excluded because they remain CommonJS after the package becomes ESM.

## Current evidence

Current `main` still has real CommonJS `.js` helpers, including security/build tooling such as `scripts/security-audit-status.js`, `scripts/security-audit-lockfile.js`, `scripts/security-audit-upstream.js`, `scripts/prisma-generate.js`, and E2E helpers such as `e2e/run-preview.js` and `e2e/run-preview-batch.js`.

Those files are not bugs in the current package mode. They are migration surface that must be handled before or together with a top-level ESM switch. For each file, the explicit Prisma 7 migration can choose the least disruptive compatible option:

1. convert the helper to ESM imports/exports and replace CommonJS-only globals where needed;
2. rename a deliberately CommonJS helper to `.cjs` and update its callers/scripts; or
3. keep a narrower CommonJS package scope if there is a concrete tooling reason and that boundary is tested.

The inventory does not choose among those options because that can affect executable entry points, Jest/E2E behavior, and operational scripts.

## Migration boundary

Before enabling top-level `"type": "module"` in the Prisma 7 migration PR:

- run this inventory and review every reported `.js` helper;
- preserve or deliberately update every package script and relative helper import that points at a renamed file;
- run unit tests, the security-audit helpers, Prisma generate, and Cloudflare/OpenNext build;
- run representative E2E/preview paths for any changed E2E helper chain;
- keep the #3114 audit exception until the Prisma dependency graph itself no longer contains the vulnerable `deepmerge-ts` edge and the full migration is verified.

The manual `Security audit review` workflow records this ESM surface as advisory evidence alongside the Prisma 7 package/schema/import readiness and support-code Prisma reference inventory. It is intentionally outside the compatible-range fail-closed gate.
