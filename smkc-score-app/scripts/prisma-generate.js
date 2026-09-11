#!/usr/bin/env node
/**
 * prisma-generate.js — CI-aware wrapper around `prisma generate`.
 *
 * Why this script exists:
 *   In CI containers (GitHub Actions), Prisma 6 cannot download the native
 *   schema/query engine binaries because outbound network access to
 *   binaries.prisma.sh is restricted (returns HTTP 403). Setting
 *   `PRISMA_SCHEMA_ENGINE_BINARY=/dev/null` and
 *   `PRISMA_QUERY_ENGINE_LIBRARY=/dev/null` forces Prisma 6 to fall back to
 *   its WASM-based engine, which is bundled with the CLI and produces
 *   identical TypeScript output. We also set
 *   `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` so Prisma 6 does not abort when
 *   the optional engines metadata is absent.
 *
 *   Prisma 7 removes several Rust-engine environment variables, including
 *   `PRISMA_QUERY_ENGINE_LIBRARY`. The wrapper therefore only injects the
 *   legacy CI overrides while the repository's Prisma CLI selector is on a
 *   pre-v7 major. This preserves today's Prisma 6 CI behavior while ensuring
 *   the future Prisma 7 migration does not carry the removed variable forward
 *   through postinstall.
 *
 *   On developer machines, those env vars are unnecessary — the native
 *   engines download fine and run faster than the WASM fallback. We detect
 *   the `CI` environment variable (set automatically by GitHub Actions and
 *   most other CI providers) and only apply the overrides there.
 *
 * Behavior:
 *   - CI + Prisma < 7 → invoke `prisma generate` with the /dev/null engine
 *     overrides.
 *   - CI + Prisma >= 7 → invoke plain `prisma generate`; the removed Prisma 6
 *     engine variables are not injected.
 *   - CI not detected → invoke plain `prisma generate`, leaving engine
 *     selection to the CLI.
 *
 * Exits with the prisma CLI's own exit code so npm/yarn surface failures
 * correctly.
 */
const { spawnSync } = require('node:child_process');
const manifest = require('../package.json');

const LEGACY_CI_ENGINE_OVERRIDES = Object.freeze({
  PRISMA_SCHEMA_ENGINE_BINARY: '/dev/null',
  PRISMA_QUERY_ENGINE_LIBRARY: '/dev/null',
  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1',
});

/**
 * Extract the leading semver major from the repository's Prisma selector.
 * Keep this intentionally conservative: unsupported selectors return null so
 * the wrapper will not inject Prisma 6-only environment variables into an
 * unknown future CLI.
 *
 * @param {unknown} selector
 * @returns {number | null}
 */
function extractPrismaMajor(selector) {
  if (typeof selector !== 'string') return null;
  const match = selector.trim().match(/^[~^]?\s*(\d+)\./);
  return match ? Number(match[1]) : null;
}

/**
 * Decide whether the legacy Prisma 6 CI engine overrides are still required.
 *
 * @param {NodeJS.ProcessEnv} parentEnv
 * @param {unknown} prismaSelector
 * @returns {boolean}
 */
function shouldUseLegacyCiEngineOverrides(parentEnv, prismaSelector) {
  if (!parentEnv.CI) return false;
  const major = extractPrismaMajor(prismaSelector);
  return major !== null && major < 7;
}

/**
 * Build the environment to pass to the spawned `prisma generate` process.
 *
 * In CI on Prisma 6, overlay the WASM-fallback overrides on top of the parent
 * env so the Prisma CLI can run without downloading native engine binaries.
 * Prisma 7 and newer receive the parent environment unchanged because the old
 * Rust-engine override variables are no longer part of the supported v7
 * contract. Outside CI, the parent env also passes through untouched.
 *
 * Exported for unit tests; the script entrypoint below calls it with the
 * repository's current `devDependencies.prisma` selector.
 *
 * @param {NodeJS.ProcessEnv} parentEnv
 * @param {unknown} prismaSelector
 * @returns {NodeJS.ProcessEnv}
 */
function buildSpawnEnv(parentEnv, prismaSelector = manifest.devDependencies?.prisma) {
  if (!shouldUseLegacyCiEngineOverrides(parentEnv, prismaSelector)) {
    return { ...parentEnv };
  }

  return {
    ...parentEnv,
    ...LEGACY_CI_ENGINE_OVERRIDES,
  };
}

module.exports = {
  LEGACY_CI_ENGINE_OVERRIDES,
  buildSpawnEnv,
  extractPrismaMajor,
  shouldUseLegacyCiEngineOverrides,
};

if (require.main === module) {
  const prismaSelector = manifest.devDependencies?.prisma;
  const env = buildSpawnEnv(process.env, prismaSelector);

  if (shouldUseLegacyCiEngineOverrides(process.env, prismaSelector)) {
    // Surface the override so CI logs make the trade-off explicit.
    process.stderr.write(
      '[prisma-generate] CI detected on Prisma < 7 — using legacy WASM engine overrides\n',
    );
  } else if (process.env.CI) {
    process.stderr.write(
      '[prisma-generate] CI detected without a Prisma < 7 selector — legacy engine overrides disabled\n',
    );
  }

  const result = spawnSync('npx', ['prisma', 'generate'], {
    stdio: 'inherit',
    env,
  });

  if (result.error) {
    // Spawning `npx` itself failed (e.g. missing binary). Surface the error
    // rather than silently exiting 0, otherwise CI appears to pass when the
    // generation never actually ran.
    process.stderr.write(
      `[prisma-generate] failed to spawn prisma CLI: ${result.error.message}\n`,
    );
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
