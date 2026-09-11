# Prisma 7 CI engine-environment transition for #3114

JSMKC currently runs Prisma 6 generation in CI through `smkc-score-app/scripts/prisma-generate.js`. GitHub-hosted CI cannot reliably download the Prisma 6 native engine binaries from `binaries.prisma.sh`, so the wrapper injects the existing `/dev/null` engine overrides and lets Prisma 6 use its bundled fallback path.

That workaround must not be carried forward mechanically to Prisma 7. Prisma's v7 upgrade guide removes several Rust-engine environment variables, including `PRISMA_QUERY_ENGINE_LIBRARY`, because Prisma 7 uses the TypeScript query compiler rather than the Prisma 6 Rust query engine by default.

## Repository behavior

The postinstall wrapper now reads the repository's `devDependencies.prisma` selector and applies the legacy CI engine overrides only when all of the following are true:

- `CI` is truthy;
- the Prisma selector is a supported semver-like selector; and
- the selected major is lower than 7.

For Prisma 7 or newer, and for selectors the wrapper cannot classify safely, it passes the parent environment through without injecting the Prisma 6 engine variables. Local development behavior is unchanged.

This is migration preparation only. The repository still uses Prisma 6.19.x today, so the current CI path continues to receive the same three overrides:

- `PRISMA_SCHEMA_ENGINE_BINARY=/dev/null`
- `PRISMA_QUERY_ENGINE_LIBRARY=/dev/null`
- `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`

The change deliberately does **not** update Prisma packages, generated client imports, schema/config, D1 behavior, or the temporary #3114 audit exception.

## Remaining migration surface

`smkc-score-app/package.json` still contains the Prisma 6 engine workaround directly in `prebuild:cf`. That command is separate from the postinstall wrapper and remains part of the explicit Prisma 7 migration boundary. It should be removed or replaced only in the major-version migration where Cloudflare/OpenNext generation can be tested on the real preview path.

When the Prisma 7 migration is attempted, verify at minimum:

1. `npm ci` / postinstall generation under CI no longer injects Prisma 6-only engine variables.
2. Cloudflare/OpenNext `prebuild:cf` generation succeeds after its legacy engine environment is removed.
3. Prisma/D1 parity, unit tests, lint/format, and Workers build remain green.
4. A real preview D1 read/write path succeeds before removing the #3114 audit exception.

Reference: Prisma ORM 7 upgrade guide, section "Various environment variables have been removed": https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
