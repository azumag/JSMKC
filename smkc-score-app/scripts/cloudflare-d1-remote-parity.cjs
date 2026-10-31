'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { planD1Migration } = require('./cloudflare-d1-migration-plan.cjs');
const { redactSensitiveText, runCfPlan, terminateProcessTree } = require('./cloudflare-cf-runner.cjs');

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_KILL_GRACE_MS = 1_000;
const WRANGLER_PREVIEW_ARGS = Object.freeze(['d1', 'migrations', 'list', 'DB', '--remote', '--env', 'preview']);
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const MIGRATION_NAME_PATTERN = /^[0-9]+_[A-Za-z0-9][A-Za-z0-9_.-]*\.sql$/;

function stripAnsi(value) {
  return String(value ?? '').replace(ANSI_PATTERN, '');
}

function normalizeMigrationNames(names, source) {
  if (!Array.isArray(names)) throw new Error(`${source} migration list must be an array`);

  const normalized = names.map((name) => {
    if (typeof name !== 'string' || !MIGRATION_NAME_PATTERN.test(name)) {
      throw new Error(`${source} returned an invalid migration name`);
    }
    return name;
  });

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error(`${source} returned duplicate migration names`);
  }

  return [...unique].sort((left, right) => left.localeCompare(right));
}

function parseCfMigrationList(stdout) {
  const text = stripAnsi(stdout).trim();
  if (!text) throw new Error('cf returned an empty migration-list response');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('cf migration-list output is not valid JSON');
  }

  if (!Array.isArray(parsed)) throw new Error('cf migration-list output must be a JSON array');
  return normalizeMigrationNames(
    parsed.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.Name !== 'string') {
        throw new Error('cf migration-list entries must contain a string Name');
      }
      return entry.Name;
    }),
    'cf',
  );
}

function parseWranglerMigrationList(stdout) {
  const text = stripAnsi(stdout);
  const hasNoPendingSentinel = /(?:^|\s)(?:✅\s*)?No migrations to apply!(?:\s|$)/m.test(text);
  const names = [];

  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .split(/[|│]/)
      .map((cell) => cell.trim())
      .filter(Boolean);
    for (const cell of cells) {
      if (MIGRATION_NAME_PATTERN.test(cell)) names.push(cell);
    }
  }

  if (hasNoPendingSentinel && names.length > 0) {
    throw new Error('Wrangler output contains both pending migrations and the no-pending sentinel');
  }
  if (hasNoPendingSentinel) return [];
  if (names.length === 0) throw new Error('Wrangler migration-list output has no recognized result');
  return normalizeMigrationNames(names, 'Wrangler');
}

function compareMigrationLists(wranglerNames, cfNames) {
  const expected = normalizeMigrationNames(wranglerNames, 'Wrangler');
  const actual = normalizeMigrationNames(cfNames, 'cf');
  const wranglerOnly = expected.filter((name) => !actual.includes(name));
  const cfOnly = actual.filter((name) => !expected.includes(name));

  return Object.freeze({
    ok: wranglerOnly.length === 0 && cfOnly.length === 0,
    pendingMigrations: Object.freeze(expected),
    wranglerOnly: Object.freeze(wranglerOnly),
    cfOnly: Object.freeze(cfOnly),
  });
}

function validateTimeout(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function runWranglerPreviewList({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  terminateImpl = terminateProcessTree,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  platform = process.platform,
} = {}) {
  validateTimeout(timeoutMs, 'timeoutMs');
  validateTimeout(killGraceMs, 'killGraceMs');

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let timedOut = false;
    let settled = false;
    let timeoutHandle = null;
    let forceKillHandle = null;

    const child = spawnImpl('wrangler', [...WRANGLER_PREVIEW_ARGS], {
      cwd,
      env,
      shell: false,
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = ({ exitCode = null, signal = null, terminationSignal = null } = {}) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeoutImpl(timeoutHandle);
      if (forceKillHandle) clearTimeoutImpl(forceKillHandle);
      resolve(
        Object.freeze({
          ok: !timedOut && spawnError === null && exitCode === 0 && signal === null,
          exitCode,
          signal,
          timedOut,
          terminationSignal,
          spawnError: spawnError ? String(spawnError.code || spawnError.message || spawnError) : null,
          stdout: redactSensitiveText(stdout, env),
          stderr: redactSensitiveText(stderr, env),
        }),
      );
    };

    if (child.stdout) child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    if (child.stderr) child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.once('error', (error) => {
      spawnError = error;
      finish();
    });
    child.once('close', (exitCode, signal) => finish({ exitCode, signal }));

    timeoutHandle = setTimeoutImpl(() => {
      if (settled) return;
      timedOut = true;
      terminateImpl(child, 'SIGTERM');
      forceKillHandle = setTimeoutImpl(() => {
        if (settled) return;
        terminateImpl(child, 'SIGKILL');
        finish({ terminationSignal: 'SIGKILL' });
      }, killGraceMs);
    }, timeoutMs);
  });
}

function assertCredentials(env) {
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (typeof env[key] !== 'string' || env[key].length === 0) {
      throw new Error(`${key} is required for preview remote parity`);
    }
  }
}

function summarizeFailure(tool, result) {
  const parts = [];
  if (result.timedOut) parts.push('timed out');
  if (result.spawnError) parts.push(`spawn error ${result.spawnError}`);
  if (result.exitCode !== null) parts.push(`exit ${result.exitCode}`);
  if (result.signal) parts.push(`signal ${result.signal}`);
  const detail = String(result.stderr || '').trim();
  if (detail) parts.push(detail);
  return `${tool} preview migration list failed${parts.length ? `: ${parts.join('; ')}` : ''}`;
}

async function runPreviewParity({
  source,
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cfRunner,
  wranglerRunner,
} = {}) {
  if (typeof source !== 'string') throw new Error('wrangler config source is required');
  assertCredentials(env);
  validateTimeout(timeoutMs, 'timeoutMs');

  const plan = planD1Migration(source, 'preview', 'list');
  const runWrangler = wranglerRunner || ((options) => runWranglerPreviewList(options));
  const runCf = cfRunner || ((selectedPlan, options) => runCfPlan(selectedPlan, options));

  const wranglerResult = await runWrangler({ timeoutMs, env });
  if (!wranglerResult.ok) throw new Error(summarizeFailure('Wrangler', wranglerResult));

  const cfResult = await runCf(plan, { timeoutMs, env });
  if (!cfResult.ok) throw new Error(summarizeFailure('cf', cfResult));

  const comparison = compareMigrationLists(
    parseWranglerMigrationList(wranglerResult.stdout),
    parseCfMigrationList(cfResult.stdout),
  );
  if (!comparison.ok) {
    throw new Error(
      `preview migration-list mismatch: Wrangler-only [${comparison.wranglerOnly.join(', ')}]; cf-only [${comparison.cfOnly.join(', ')}]`,
    );
  }

  return Object.freeze({
    ok: true,
    environment: 'preview',
    pendingMigrations: comparison.pendingMigrations,
  });
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('this command is preview-only and accepts no arguments');
  }
  const configPath = path.resolve(__dirname, '..', 'wrangler.toml');
  const source = fs.readFileSync(configPath, 'utf8');
  const result = await runPreviewParity({ source, env: process.env });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cloudflare-d1-remote-parity: ${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_KILL_GRACE_MS,
  DEFAULT_TIMEOUT_MS,
  WRANGLER_PREVIEW_ARGS,
  compareMigrationLists,
  parseCfMigrationList,
  parseWranglerMigrationList,
  runPreviewParity,
  runWranglerPreviewList,
  stripAnsi,
};
