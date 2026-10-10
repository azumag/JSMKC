'use strict';

// Read-only parity record for the Cloudflare `cf` CLI surfaces tracked by issue
// #4201. Each entry records what was actually observed and the command that
// produced it, so a reviewer (or a later slice that flips a surface) can re-run
// the same command instead of trusting prose.
//
// This module never spawns a mutating command. `readOnlyArgs()` is the only
// source of argv, and `npm run cloudflare:cf-parity` runs `--version` plus
// `<command> --help` for each surface. See docs/cloudflare-d1-cf-parity.md.

const VERIFIED_TOOLS = Object.freeze({
  cf: 'v1.0.0-beta.12',
  // Pinned by package-lock.json; the comparison point for every surface.
  wrangler: '4.144.0',
});

// Why a surface is not switch-ready yet. Every surface that keeps Wrangler as
// the operational path references at least one id here, so the regression test
// and the doc agree on the reason instead of drifting apart.
const BLOCKING_REASONS = Object.freeze({
  'remote-unverified':
    'no credentialed remote run has compared cf against Wrangler for this surface; only offline/local evidence exists',
  'local-mode-hang':
    'cf local mode printed its result and then failed to exit on one run of `cf d1 migrations list --local` (killed by a timeout), so a switch needs an explicit timeout guard',
  'audit-sentinel-shape':
    '`.github/workflows/d1-migrate.yml` greps the Wrangler text output for "No migrations to apply!"; cf prints `[]` for the same state, so the audit step must be rewritten and re-verified remotely first',
  'interactive-confirm-fail-open':
    'cf apply answers its own "About to apply N migration(s) ... continue?" prompt with yes in a non-interactive context; `wrangler d1 migrations apply` has no prompt, so switching without a guard drops that confirmation step',
  'no-cf-equivalent':
    'cf v1.0.0-beta.12 has no `d1 export`/`d1 import` command, so the Wrangler operational command is the only path',
  'output-shape-differs':
    'the preview preflight parses `wrangler d1 execute --json` output; `cf d1 query` documents no `--json` flag and returns the D1 HTTP query API result instead',
  'no-local-verification-path':
    '`cf d1 query --local` fails closed ("This command has no local equivalent"), so this surface cannot be verified without Cloudflare credentials',
  'auth-error-text-differs':
    'the preflight keys its fail-open auth/log detection on Wrangler-specific text (CLOUDFLARE_API_TOKEN / non-interactive / code 7403); cf reports a boxed APIError, so detection would stop matching',
});

const PARITY_SURFACES = Object.freeze([
  Object.freeze({
    key: 'd1-migrations-list',
    label: 'D1 migration list (production / preview)',
    wranglerCommand: 'wrangler d1 migrations list DB --remote [--env preview]',
    cfCommand: 'cf d1 migrations list <DATABASE_ID> --pattern migrations/*.sql',
    helpArgs: Object.freeze(['d1', 'migrations', 'list', '--help']),
    requiredFlags: Object.freeze(['--dir', '--pattern', '--table']),
    absentFlags: Object.freeze([]),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['remote-unverified', 'audit-sentinel-shape', 'local-mode-hang']),
    evidence: Object.freeze([
      'cf d1 migrations list <DATABASE_ID> --local --dir migrations --pattern "migrations/*.sql"',
      'cf d1 migrations list <DATABASE_ID> --local --dir migrations (default pattern)',
    ]),
    observed: Object.freeze([
      'the pinned pattern and the tool default both listed the same 46 files, matching `wrangler d1 migrations list DB --local` on the same directory',
      'output is a JSON array of {"Name":"<file>"}; the empty state prints `[]` (exit 0) where Wrangler prints "No migrations to apply!"',
      'nested files such as migrations/0005_add_public_modes/migration.sql are not discovered by either tool default',
    ]),
  }),
  Object.freeze({
    key: 'd1-migrations-apply',
    label: 'D1 migration apply (production / preview)',
    wranglerCommand: 'wrangler d1 migrations apply DB --remote [--env preview]',
    cfCommand: 'cf d1 migrations apply <DATABASE_ID> --dir migrations --pattern migrations/*.sql',
    helpArgs: Object.freeze(['d1', 'migrations', 'apply', '--help']),
    requiredFlags: Object.freeze(['--dir', '--pattern', '--table']),
    absentFlags: Object.freeze([]),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze(['interactive-confirm-fail-open', 'remote-unverified', 'local-mode-hang']),
    evidence: Object.freeze(['cf d1 migrations apply <DATABASE_ID> --local --dir migrations --persist-to <dir>']),
    observed: Object.freeze([
      'prints "? About to apply N migration(s) ... continue?" followed by "Using fallback value in non-interactive context: yes"',
      'applies sequentially and stops at the first failing file, leaving earlier files applied (same partial-apply shape as Wrangler)',
      'remote targeting is the default and `--local` is the opt-in; there is no `--remote` and no `--env`',
    ]),
  }),
  Object.freeze({
    key: 'd1-export',
    label: 'D1 export / operational SQL dump',
    wranglerCommand: 'wrangler d1 export DB --remote --output <file>',
    cfCommand: null,
    helpArgs: Object.freeze(['d1', '--help']),
    requiredFlags: Object.freeze([]),
    absentFlags: Object.freeze(['export', 'import']),
    verdict: 'unsupported-in-cf',
    blockingReasons: Object.freeze(['no-cf-equivalent']),
    evidence: Object.freeze(['cf d1 --help', 'cf --help', 'cf d1 export --help']),
    observed: Object.freeze([
      'cf d1 exposes create/delete/edit/get/list/migrations/query/raw/time-travel/update only',
      '`cf d1 export --help` prints the `cf d1` command list instead of an export help page',
      '`cf --help` lists no export, import, dump, or backup command',
    ]),
  }),
  Object.freeze({
    key: 'preview-schema-preflight',
    label: 'Preview D1 schema preflight (e2e/lib/preview-schema-preflight.js)',
    wranglerCommand: 'wrangler d1 execute DB --remote --env preview --json --command <SQL>',
    cfCommand: 'cf d1 query <DATABASE_ID> --sql <SQL>',
    helpArgs: Object.freeze(['d1', 'query', '--help']),
    requiredFlags: Object.freeze(['--sql', '--params', '--batch', '--dry-run']),
    absentFlags: Object.freeze(['--remote', '--json']),
    verdict: 'keep-wrangler',
    blockingReasons: Object.freeze([
      'output-shape-differs',
      'auth-error-text-differs',
      'no-local-verification-path',
      'remote-unverified',
    ]),
    evidence: Object.freeze([
      'cf d1 query <DATABASE_ID> --sql "select 1 as x" --dry-run',
      'cf d1 query <DATABASE_ID> --sql "select 1 as x" --local',
      'cf schema d1 query',
    ]),
    observed: Object.freeze([
      'the non-executing form shows the request it would send: POST /accounts/<account-id>/d1/database/<database-id>/query with body {"sql": ...}',
      '`--local` fails closed: "This command has no local equivalent", exit 1',
      'neither `--remote` nor `--json` is documented for this command',
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
function verifyHelpOutput(helpText, surface) {
  const text = String(helpText || '');
  return {
    key: surface.key,
    ok:
      surface.requiredFlags.every((flag) => text.includes(flag)) &&
      surface.absentFlags.every((flag) => !text.includes(flag)),
    missing: surface.requiredFlags.filter((flag) => !text.includes(flag)),
    unexpected: surface.absentFlags.filter((flag) => text.includes(flag)),
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
  const lines = [`cf parity check against ${VERIFIED_TOOLS.cf} (wrangler ${VERIFIED_TOOLS.wrangler})`];
  for (const result of results) lines.push(`- ${result.key}: ${result.ok ? 'ok' : 'DRIFT'}`);
  process.stdout.write(`${lines.join('\n')}\n`);

  if (cfVersion !== VERIFIED_TOOLS.cf) {
    process.stderr.write(
      `cloudflare-cf-parity: cf version changed from ${VERIFIED_TOOLS.cf} to ${cfVersion || 'unknown'}; re-verify the surfaces and update docs/cloudflare-d1-cf-parity.md.\n`,
    );
    process.exitCode = 1;
  } else if (drifted.length > 0) {
    process.stderr.write(
      `cloudflare-cf-parity: ${drifted.length} surface(s) drifted from the recorded cf surface; update the parity record before switching anything.\n`,
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
