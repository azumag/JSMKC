#!/usr/bin/env node
/**
 * prisma-generate.js — CI-aware wrapper around `prisma generate`.
 *
 * Why this script exists:
 *   In CI containers (GitHub Actions), the Prisma CLI cannot download the
 *   native schema/query engine binaries because outbound network access to
 *   binaries.prisma.sh is restricted (returns HTTP 403). Setting
 *   `PRISMA_SCHEMA_ENGINE_BINARY=/dev/null` and
 *   `PRISMA_QUERY_ENGINE_LIBRARY=/dev/null` forces Prisma to fall back to its
 *   WASM-based engine, which is bundled with the CLI and produces identical
 *   TypeScript output. We also set `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`
 *   so Prisma does not abort when the optional engines metadata is absent.
 *
 *   On developer machines, those env vars are unnecessary — the native
 *   engines download fine and run faster than the WASM fallback. We detect
 *   the `CI` environment variable (set automatically by GitHub Actions and
 *   most other CI providers) and only apply the overrides there.
 *
 * Behavior:
 *   - CI detected (CI env var truthy) → invoke `prisma generate` with the
 *     /dev/null engine overrides.
 *   - CI not detected → invoke plain `prisma generate`, leaving engine
 *     selection to the CLI (native engines when available, WASM otherwise).
 *
 * Exits with the prisma CLI's own exit code so npm/yarn surface failures
 * correctly.
 */
const { spawnSync } = require('node:child_process');

/**
 * Build the environment to pass to the spawned `prisma generate` process.
 *
 * In CI, overlay the WASM-fallback overrides on top of the parent env so
 * the Prisma CLI can run without downloading native engine binaries.
 * Outside CI, pass the parent env through untouched so the CLI can use
 * the faster native engines when available.
 *
 * Exported for unit tests; the script entrypoint below calls it via
 * `buildSpawnEnv(process.env)` at runtime.
 *
 * @param {NodeJS.ProcessEnv} parentEnv
 * @returns {NodeJS.ProcessEnv}
 */
function buildSpawnEnv(parentEnv) {
  if (!parentEnv.CI) {
    return { ...parentEnv };
  }
  return {
    ...parentEnv,
    PRISMA_SCHEMA_ENGINE_BINARY: '/dev/null',
    PRISMA_QUERY_ENGINE_LIBRARY: '/dev/null',
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1',
  };
}

module.exports = { buildSpawnEnv };

if (require.main === module) {
  const env = buildSpawnEnv(process.env);

  if (process.env.CI) {
    // Surface the override so CI logs make the trade-off explicit.
    process.stderr.write(
      '[prisma-generate] CI detected — using WASM engine overrides\n',
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