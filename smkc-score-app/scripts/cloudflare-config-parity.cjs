'use strict';

// Read-only parity record for the Cloudflare `cf` CLI Worker-configuration surfaces
// tracked by issue #4201. Each entry records what was actually observed and the
// command that produced it, so a reviewer (or a later slice that flips a surface)
// can re-run the same command instead of trusting prose.
//
// This module never spawns a mutating command. `readOnlyArgs()` is the only source
// of argv, and `npm run cloudflare:config-parity` runs `--version` plus
// `<command> --help` for each surface. See docs/cloudflare-config-cf-parity.md.

const VERIFIED_TOOLS = Object.freeze({
  cf: 'v1.0.0-beta.12',
  // Pinned by package-lock.json; the comparison point for every surface.
  wrangler: '4.144.0',
});

// Why a surface is not switch-ready yet. Every surface that keeps Wrangler as the
// operational path references at least one id here, so the regression test and the
// doc agree on the reason instead of drifting apart.
const BLOCKING_REASONS = Object.freeze({
  'migrations-dir-not-migrated':
    'cf migrate reports `migrations_dir` as requiring manual migration for both D1 bindings and `D1BindingOptions` exposes no migrations-directory field, so the setting the fail-closed D1 target resolver depends on would be dropped',
  'env-mode-not-fail-closed':
    'the generated `switch (ctx.mode)` resolves an unknown or missing mode to its `default:` branch, which is production, where `wrangler --env <unknown>` fails closed and lists the configured environments',
  'config-throws-on-todo':
    'the generated cloudflare.config.ts throws `Migration incomplete. Resolve every cf migrate TODO` until the reported TODOs are resolved by hand, so the migrated config is inert as generated',
  'unknown-mode-silently-defaults':
    '`--mode bogus-mode`, `--mode production`, and no `--mode` at all all selected the `default:` (production) branch, so replacing `--env preview` with `--mode preview` would turn a typo into a silent production deploy',
  'build-product-unverified':
    'the OpenNext build output, compatibility date/flags, assets/D1/R2 bindings, domains, and secrets were only exercised through a local dry run of a hand-edited migrated config, never against the real build product',
  'dev-server-manifest-required':
    '`cf deploy`/`cf build` require exactly one declared dev server in the manifest (@cloudflare/vite-plugin, wrangler, cloudflare-py-dev-server, or cloudflare-rs-dev-server) and fail otherwise',
  'remote-unverified':
    'no credentialed remote run has compared cf against Wrangler for this surface; only offline/local evidence exists',
  'secret-command-renamed':
    'the documented `wrangler secret put <NAME>` has no same-named cf replacement (`cf workers secrets update`), so the operational docs and secrets runbook must be rewritten together with the switch',
  'types-source-unverified':
    '`cf workers types` generates from cloudflare.config.ts, so it depends on the config migration landing first and was not exercised against this repository',
  'no-cf-equivalent':
    'cf v1.0.0-beta.12 has no live-tail command; `cf observability` exposes aggregate query surfaces instead of a tail with equivalent filter/environment semantics',
});

const PARITY_SURFACES = Object.freeze([
  Object.freeze({
    key: 'wrangler-config-migration',
    label: 'Worker configuration (wrangler.toml → cloudflare.config.ts)',
    wranglerCommand: 'wrangler.toml (top-level Worker plus [env.preview])',
    cfCommand: 'cf migrate wrangler.toml',
    helpArgs: Object.freeze(['migrate', '--help']),
    requiredFlags: Object.freeze(['--dry-run', '--force', '--bundler', '--install']),
    absentFlags: Object.freeze([]),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze([
      'migrations-dir-not-migrated',
      'env-mode-not-fail-closed',
      'config-throws-on-todo',
      'remote-unverified',
    ]),
    evidence: Object.freeze([
      'cf migrate wrangler.toml --dry-run --no-install --force',
      'cf migrate wrangler.toml --no-install --force (throwaway copy outside this repository)',
      'cf deploy --dry-run against the generated config',
    ]),
    observed: Object.freeze([
      'the dry run reports `Would update 2 file(s): cloudflare.config.ts, wrangler.config.ts`',
      'every production and preview identity stays distinct: worker names, domains, the two D1 ids (3132bf8c-… / 5a974a4a-…), and the two R2 buckets',
      '`migrations_dir` is reported as requiring manual migration for both D1 bindings and is absent from the generated bindings',
      'the generated config throws `Migration incomplete. Resolve every cf migrate TODO` until the TODOs are resolved by hand',
    ]),
  }),
  Object.freeze({
    key: 'environment-selection',
    label: 'Environment selection (--env preview)',
    wranglerCommand: 'wrangler deploy --env preview',
    cfCommand: 'cf deploy --mode preview',
    helpArgs: Object.freeze(['deploy', '--help']),
    requiredFlags: Object.freeze(['--mode', '--dry-run', '--prebuilt']),
    absentFlags: Object.freeze(['--env']),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['unknown-mode-silently-defaults', 'remote-unverified']),
    evidence: Object.freeze([
      'cf deploy --dry-run (no --mode) against a probe config with one branch per mode',
      'cf deploy --dry-run --mode preview / --mode bogus-mode / --mode production against the same probe',
      'wrangler deploy --dry-run --env bogus for comparison',
    ]),
    observed: Object.freeze([
      'no --mode, --mode production, and --mode bogus-mode all selected the `default:` (production) branch',
      'only --mode preview selected the preview branch',
      '`wrangler deploy --dry-run --env bogus` fails closed with `No environment found in configuration with name "bogus"` and lists the configured environments',
    ]),
  }),
  Object.freeze({
    key: 'worker-deploy',
    label: 'Worker deploy (wrangler deploy)',
    wranglerCommand: 'wrangler deploy / wrangler deploy --env preview',
    cfCommand: 'cf deploy / cf deploy --mode preview',
    helpArgs: Object.freeze(['deploy', '--help']),
    requiredFlags: Object.freeze(['--dry-run', '--prebuilt', '--secrets-file', '--mode']),
    absentFlags: Object.freeze(['--env']),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['build-product-unverified', 'dev-server-manifest-required', 'remote-unverified']),
    evidence: Object.freeze(['cf deploy --help', 'cf deploy --dry-run in the throwaway copy']),
    observed: Object.freeze([
      '`--dry-run` builds and runs checks without uploading; there is no `--env` flag',
      'without a declared dev server, `cf deploy --dry-run` fails with `No Cloudflare dev-server is installed in this project` and lists the four accepted manifests',
      'with wrangler declared the build printed `Delegating to Wrangler`, then failed on the generated config TODO throw and on the missing `.open-next/assets` directory',
    ]),
  }),
  Object.freeze({
    key: 'worker-build',
    label: 'Worker build (opennextjs-cloudflare build)',
    wranglerCommand: 'wrangler-based OpenNext build (npm run build:cf)',
    cfCommand: 'cf build',
    helpArgs: Object.freeze(['build', '--help']),
    requiredFlags: Object.freeze(['--mode', '--local']),
    absentFlags: Object.freeze(['--env']),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['build-product-unverified', 'remote-unverified']),
    evidence: Object.freeze(['cf build --help', 'cf deploy --dry-run (which builds first)']),
    observed: Object.freeze([
      '`cf build` documents no project-specific options beyond the global flags, and delegates to Wrangler for this project shape',
    ]),
  }),
  Object.freeze({
    key: 'worker-secrets',
    label: 'Worker secrets (wrangler secret put)',
    wranglerCommand: 'npx wrangler secret put <NAME>',
    cfCommand: 'cf workers secrets update <NAME> --text <VALUE>',
    helpArgs: Object.freeze(['workers', 'secrets', 'update', '--help']),
    requiredFlags: Object.freeze(['--worker', '--text', '--dry-run']),
    absentFlags: Object.freeze([]),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['secret-command-renamed', 'remote-unverified']),
    evidence: Object.freeze([
      'cf workers secrets --help',
      'cf workers secrets update --help',
      'cf workers secrets put --help',
    ]),
    observed: Object.freeze([
      'the subcommands are bulk/delete/get/list/update; there is no `put`',
      '`cf workers secrets put --help` prints the `cf workers secrets` command list instead of a put help page',
    ]),
  }),
  Object.freeze({
    key: 'worker-types',
    label: 'Worker types (wrangler types)',
    wranglerCommand: 'wrangler types',
    cfCommand: 'cf workers types',
    helpArgs: Object.freeze(['workers', 'types', '--help']),
    requiredFlags: Object.freeze(['--include-runtime']),
    absentFlags: Object.freeze([]),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['types-source-unverified', 'remote-unverified']),
    evidence: Object.freeze(['cf workers types --help']),
    observed: Object.freeze([
      'documented as `Generate types from cloudflare.config.ts`, so it depends on the config migration landing first',
    ]),
  }),
  Object.freeze({
    key: 'worker-logs',
    label: 'Worker logs / tail (wrangler tail)',
    wranglerCommand: 'wrangler tail',
    cfCommand: null,
    helpArgs: Object.freeze(['--help']),
    requiredFlags: Object.freeze([]),
    absentFlags: Object.freeze(['tail']),
    verdict: 'unsupported-in-cf',
    blockingReasons: Object.freeze(['no-cf-equivalent']),
    evidence: Object.freeze(['cf --help', 'cf observability --help']),
    observed: Object.freeze([
      '`cf --help` lists no tail command',
      '`cf observability` lists destinations/issues/queries/shared-queries/telemetry/tracing, none of which is a live tail',
    ]),
  }),
]);

function parseCfVersion(stdout) {
  const match = /v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(String(stdout || ''));
  return match ? `v${match[1]}` : null;
}

// Pure check over captured `cf <command> --help` text: the flags this
// repository's plan depends on must still be documented, and the flags we
// deliberately do not rely on must still be absent. Upstream drift has to fail
// loudly instead of silently changing what a switch would do.
// Match a recorded flag/command as a delimited token instead of a bare
// substring: help prose such as "details" must not satisfy an absent "tail"
// check, while an added "cf tail" line must still be detected as drift.
function helpContains(text, flag) {
  const escaped = String(flag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`).test(text);
}

function verifyHelpOutput(helpText, surface) {
  const text = String(helpText || '');
  return {
    key: surface.key,
    ok:
      surface.requiredFlags.every((flag) => helpContains(text, flag)) &&
      surface.absentFlags.every((flag) => !helpContains(text, flag)),
    missing: surface.requiredFlags.filter((flag) => !helpContains(text, flag)),
    unexpected: surface.absentFlags.filter((flag) => helpContains(text, flag)),
  };
}

// The only argv this module is allowed to spawn.
function readOnlyArgs(surface) {
  return [...surface.helpArgs];
}

function main() {
  const { spawnSync } = require('node:child_process');

  const versionRun = spawnSync('cf', ['--version'], { encoding: 'utf8' });
  if (versionRun.error && versionRun.error.code === 'ENOENT') {
    process.stdout.write('cf CLI not installed locally; no parity check was performed.\n');
    return;
  }

  const cfVersion = parseCfVersion(`${versionRun.stdout || ''}${versionRun.stderr || ''}`);
  const results = PARITY_SURFACES.map((surface) =>
    verifyHelpOutput(`${spawnSync('cf', readOnlyArgs(surface), { encoding: 'utf8' }).stdout || ''}`, surface),
  );

  const drifted = results.filter((result) => !result.ok);
  const lines = [`cf config parity check against ${VERIFIED_TOOLS.cf} (wrangler ${VERIFIED_TOOLS.wrangler})`];
  for (const result of results) lines.push(`- ${result.key}: ${result.ok ? 'ok' : 'DRIFT'}`);
  process.stdout.write(`${lines.join('\n')}\n`);

  if (cfVersion !== VERIFIED_TOOLS.cf) {
    process.stderr.write(
      `cloudflare-config-parity: cf version changed from ${VERIFIED_TOOLS.cf} to ${cfVersion || 'unknown'}; re-verify the surfaces and update docs/cloudflare-config-cf-parity.md.\n`,
    );
    process.exitCode = 1;
  } else if (drifted.length > 0) {
    process.stderr.write(
      `cloudflare-config-parity: ${drifted.length} surface(s) drifted from the recorded cf surface; update the parity record before switching anything.\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  BLOCKING_REASONS,
  PARITY_SURFACES,
  VERIFIED_TOOLS,
  parseCfVersion,
  readOnlyArgs,
  verifyHelpOutput,
};
