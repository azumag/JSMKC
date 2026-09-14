# Prisma 7 CI engine-environment transition for #3114

JSMKC currently runs Prisma 6 generation in CI through `smkc-score-app/scripts/prisma-generate.js`. GitHub-hosted CI cannot reliably download the Prisma 6 native engine binaries from `binaries.prisma.sh`, so the wrapper injects the existing `/dev/null` engine overrides and lets Prisma 6 use its bundled fallback path.

That workaround must not be carried forward mechanically to Prisma 7. Prisma's v7 upgrade guide removes several Rust-engine environment variables, including `PRISMA_QUERY_ENGINE_LIBRARY`, because Prisma 7 uses the TypeScript query compiler rather than the Prisma 6 Rust query engine by default.

## Repository behavior

The postinstall wrapper reads the repository's `devDependencies.prisma` selector and applies the legacy CI engine overrides only when all of the following are true:

- `CI` is truthy;
- the Prisma selector is a complete exact, caret, or tilde SemVer selector; and
- the selected major is lower than 7.

The selector guard validates the complete version-shaped selector rather than extracting only a leading `6.` / `7.` prefix. Prerelease and build metadata are allowed when they are valid SemVer components, while incomplete or malformed values such as `^6.not-semver`, comparator/range expressions, workspace selectors, and protocol aliases are treated as unknown. This is intentional: a selector that merely looks like Prisma 6 must not cause the wrapper to inject Prisma 6-only environment variables.

For Prisma 7 or newer, and for selectors the wrapper cannot classify safely, it passes the parent environment through without injecting the Prisma 6 engine variables. Local development behavior is unchanged.

Cloudflare/OpenNext generation has a separate requirement on Prisma 6: `prebuild:cf` must use the same WASM-oriented engine environment even when the build is invoked outside a conventional CI process. The package script now gates that environment through `scripts/prisma-major-check.js`:

- Prisma < 7: keep the current three legacy engine overrides and run `prisma generate`;
- Prisma >= 7: run plain `prisma generate` without those removed Prisma 6 variables;
- unrecognized selectors: fail closed into the plain-generation branch rather than guessing that legacy variables are safe.

`prisma-major-check.js` uses the same selector parser as the postinstall wrapper, so malformed pre-v7-looking selectors fail closed consistently in both CI/postinstall and Cloudflare `prebuild:cf` paths.

This preserves today's Prisma 6 Cloudflare build behavior while making the package script stop forwarding the removed engine variables automatically when the CLI selector moves to Prisma 7.

The repository still uses Prisma 6.19.x today, so the current CI and Cloudflare build paths continue to receive the same three overrides where required:

- `PRISMA_SCHEMA_ENGINE_BINARY=/dev/null`
- `PRISMA_QUERY_ENGINE_LIBRARY=/dev/null`
- `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`

The change deliberately does **not** update Prisma packages, generated client imports, schema/config, D1 behavior, or the temporary #3114 audit exception.

## Remaining migration surface

The major-version migration still needs real Cloudflare/OpenNext and D1 preview validation. The new major gate only ensures the removed Prisma 6 variables are not carried into Prisma 7 by the package scripts; it does not prove that plain Prisma 7 generation produces a deployable Worker or that the migrated client can read and write the real preview D1 database.

When the Prisma 7 migration is attempted, verify at minimum:

1. `npm ci` / postinstall generation under CI no longer injects Prisma 6-only engine variables.
2. `prebuild:cf` selects its plain-generation branch under the Prisma 7 selector and the Cloudflare/OpenNext build succeeds.
3. Prisma/D1 parity, unit tests, lint/format, and Workers build remain green.
4. A real preview D1 read/write path succeeds before removing the #3114 audit exception.
5. After the migration is proven, remove any no-longer-useful compatibility gate or documentation rather than leaving Prisma 6 migration scaffolding indefinitely.

Reference: Prisma ORM 7 upgrade guide, section "Various environment variables have been removed": https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
