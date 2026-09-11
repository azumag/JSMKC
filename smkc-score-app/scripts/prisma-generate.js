#!/usr/bin/env node
/**
 * prisma-generate.js — Prisma-major-aware wrapper around `prisma generate`.
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
 *   Cloudflare/OpenNext builds need the same Prisma 6 WASM generation path
 *   even when they are invoked outside a conventional CI environment. The
 *   `--force-legacy-engine-overrides-for-prisma6` flag lets `prebuild:cf`
 *   request that behavior without hard-coding removed Prisma environment
 *   variables in package.json.
 *
 *   Prisma 7 removes several Rust-engine environment variables, including
 *   `PRISMA_QUERY_ENGINE_LIBRARY`. Both the normal CI path and the explicit
 *   Cloudflare-build path therefore stop injecting the legacy overrides as
 *   soon as the repository's Prisma CLI selector reaches v7.
 *
 * Behavior:
 *   - CI + Prisma < 7 → invoke `prisma generate` with the /dev/null engine
 *     overrides.
 *   - explicit Cloudflare flag + Prisma < 7 → use the same overrides even
 *     outside CI.
 *   - Prisma >= 7 or an unknown selector → invoke plain `prisma generate`;
 *     removed Prisma 6 engine variables are not injected.
 *   - local development without the flag → invoke plain `prisma generate`.
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

const FORCE_LEGACY_ENGINE_OVERRIDES_FLAG = '--force-legacy-engine-overrides-for-prisma6';

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
 * Decide whether the legacy Prisma 6 engine overrides are still required.
 *
 * @param {NodeJS.ProcessEnv} parentEnv
 * @param {unknown} prismaSelector
 * @param {{ forceLegacyEngineOverrides?: boolean }} options
 * @returns {boolean}
 */
function shouldUseLegacyCiEngineOverrides(parentEnv, prismaSelector, options = {}) {
  const major = extractPrismaMajor(prismaSelector);
  if (major === null || major >= 7) return false;

  return Boolean(parentEnv.CI) || options.forceLegacyEngineOverrides === true;
}

/**
 * Build the environment to pass to the spawned `prisma generate` process.
 *
 * In CI on Prisma 6, or when the Cloudflare build path explicitly requests
 * the legacy Prisma 6 generation mode, overlay the WASM-fallback overrides on
 * top of the parent env. Prisma 7 and newer receive the parent environment
 * unchanged because the old Rust-engine override variables are no longer part
 * of the supported v7 contract. Local development also passes through
 * unchanged unless the explicit Cloudflare-build flag is used.
 *
 * Exported for unit tests; the script entrypoint below calls it with the
 * repository's current `devDependencies.prisma` selector.
 *
 * @param {NodeJS.ProcessEnv} parentEnv
 * @param {unknown} prismaSelector
 * @param {{ forceLegacyEngineOverrides?: boolean }} options
 * @returns {NodeJS.ProcessEnv}
 */
function buildSpawnEnv(parentEnv, prismaSelector = manifest.devDependencies?.prisma, options = {}) {
  if (!shouldUseLegacyCiEngineOverrides(parentEnv, prismaSelector, options)) {
    return { ...parentEnv };
  }

  return {
    ...parentEnv,
    ...LEGACY_CI_ENGINE_OVERRIDES,
  };
}

module.exports = {
  FORCE_LEGACY_ENGINE_OVERRIDES_FLAG,
  LEGACY_CI_ENGINE_OVERRIDES,
  buildSpawnEnv,
  extractPrismaMajor,
  shouldUseLegacyCiEngineOverrides,
};

if (require.main === module) {
  const prismaSelector = manifest.devDependencies?.prisma;
  const forceLegacyEngineOverrides = process.argv.slice(2).includes(FORCE_LEGACY_ENGINE_OVERRIDES_FLAG);
  const options = { forceLegacyEngineOverrides };
  const env = buildSpawnEnv(process.env, prismaSelector, options);
  const useLegacyEngineOverrides = shouldUseLegacyCiEngineOverrides(process.env, prismaSelector, options);

  if (useLegacyEngineOverrides) {
    const reason = forceLegacyEngineOverrides ? 'Cloudflare build requested' : 'CI detected';
    process.stderr.write(
      `[prisma-generate] ${reason} on Prisma < 7 — using legacy WASM engine overrides\n`,
    );
  } else if (process.env.CI || forceLegacyEngineOverrides) {
    process.stderr.write(
      '[prisma-generate] Prisma < 7 legacy engine overrides disabled for the selected Prisma version\n',
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
    process.stderr.write(`[prisma-generate] failed to spawn prisma CLI: ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
