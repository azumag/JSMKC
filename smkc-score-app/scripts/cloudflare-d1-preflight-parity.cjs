'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { planD1Query, previewSchemaCheckQueries } = require('./cloudflare-d1-query-plan.cjs');
const { redactSensitiveText, runCfPlan, terminateProcessTree } = require('./cloudflare-cf-runner.cjs');
const { parsePresentColumns } = require('../e2e/lib/preview-schema-preflight.js');

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_KILL_GRACE_MS = 1_000;
const TRANSIENT_EMPTY_OUTPUT_RETRIES = 1;
const ANSI_PATTERN = /\[[0-?]*[ -/]*[@-~]/g;
const REQUIRED_COLUMN_PATTERN = /^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z0-9_]+$/;

// Mirrors the incumbent contract in e2e/lib/preview-schema-preflight.js:
// a transient empty-output failure is retried once, a timeout throws
// immediately, and any non-empty failure is final. The cf adapter below
// reproduces the same contract rather than a different retry policy.
function wranglerPreflightArgs(sql) {
  return ['d1', 'execute', 'DB', '--remote', '--env', 'preview', '--json', '--command', sql];
}

function stripAnsi(value) {
  return String(value ?? '').replace(ANSI_PATTERN, '');
}

function hasEmptyOutput(result) {
  return (
    !result.timedOut && !result.spawnError && !String(result.stdout || '').trim() && !String(result.stderr || '').trim()
  );
}

// cf reports API and setup errors as a boxed `APIError` block on stderr rather
// than Wrangler's JSON `error` field, so the auth/setup classification keys on
// the cf error shape instead. Anything matching is an environment
// credential/setup problem (warn & continue), never schema drift.
function isCfAuthOrSetupFailure(result) {
  const text = `${stripAnsi(result.stderr)}\n${stripAnsi(result.stdout)}`;
  return [
    /APIError/i,
    /\b(?:401|403|9109|10000)\b/,
    /not valid or is not authorized/i,
    /authentication|unauthorized|invalid api token|CLOUDFLARE_API_TOKEN/i,
    /EPERM|operation not permitted|ENOENT/i,
    /dev-registry/i,
  ].some((pattern) => pattern.test(text));
}

// cf d1 query prints the Cloudflare v4 API envelope
// {success, errors, result: [{results: [...]}]}; the parser also accepts a
// bare result array in case the CLI unwraps the envelope. Anything else,
// non-JSON output, or an absent results array fails closed.
function parseCfQueryLabels(stdout) {
  const text = stripAnsi(stdout).trim();
  if (!text) throw new Error('cf returned an empty query response');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('cf query output is not valid JSON');
  }

  const entries = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.result) ? parsed.result : null;
  if (!entries) throw new Error('cf query output must be a JSON array or a v4 envelope with a result array');

  const labels = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.results)) {
      throw new Error('cf query output entries must contain a results array');
    }
    for (const row of entry.results) {
      const label = row && typeof row === 'object' ? row.required_column : undefined;
      if (typeof label !== 'string' || !REQUIRED_COLUMN_PATTERN.test(label)) {
        throw new Error('cf query output rows must contain a valid required_column label');
      }
      labels.add(label);
    }
  }
  return labels;
}

function compareColumnLabels(wranglerLabels, cfLabels) {
  const wranglerOnly = [...wranglerLabels].filter((label) => !cfLabels.has(label)).sort();
  const cfOnly = [...cfLabels].filter((label) => !wranglerLabels.has(label)).sort();
  return Object.freeze({
    ok: wranglerOnly.length === 0 && cfOnly.length === 0,
    wranglerOnly: Object.freeze(wranglerOnly),
    cfOnly: Object.freeze(cfOnly),
  });
}

function validateTimeout(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function assertCredentials(env) {
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (typeof env[key] !== 'string' || env[key].length === 0) {
      throw new Error(`${key} is required for preview schema-preflight parity`);
    }
  }
}

function summarizeFailure(tool, result) {
  const parts = [];
  if (result.timedOut) parts.push('timed out');
  if (result.spawnError) parts.push(`spawn error ${result.spawnError}`);
  if (result.exitCode !== null) parts.push(`exit ${result.exitCode}`);
  if (result.signal) parts.push(`signal ${result.signal}`);
  const detail = stripAnsi(result.stderr).trim();
  if (detail) parts.push(detail);
  return `${tool} preview schema-check query failed${parts.length ? `: ${parts.join('; ')}` : ''}`;
}

function runWranglerPreflightQuery({
  sql,
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

    const child = spawnImpl('wrangler', wranglerPreflightArgs(sql), {
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

async function runWranglerWithContract(options) {
  const run = options.wranglerRunner || runWranglerPreflightQuery;
  let result = await run(options);
  for (
    let attempt = 0;
    attempt < TRANSIENT_EMPTY_OUTPUT_RETRIES && !result.ok && hasEmptyOutput(result);
    attempt += 1
  ) {
    result = await run(options);
  }
  if (!result.ok) throw new Error(summarizeFailure('Wrangler', result));
  return result;
}

async function runCfWithContract({ sql, source, timeoutMs, env, cfRunner, warn }) {
  const allowed = previewSchemaCheckQueries();
  const plan = planD1Query(source, 'preview', sql, allowed);
  const runCf = cfRunner || ((selectedPlan, runOptions) => runCfPlan(selectedPlan, runOptions));

  let result = await runCf(plan, { timeoutMs, env });
  if (result.timedOut) throw new Error(summarizeFailure('cf', result));
  for (
    let attempt = 0;
    attempt < TRANSIENT_EMPTY_OUTPUT_RETRIES && !result.ok && hasEmptyOutput(result);
    attempt += 1
  ) {
    result = await runCf(plan, { timeoutMs, env });
    if (result.timedOut) throw new Error(summarizeFailure('cf', result));
  }

  if (!result.ok) {
    if (isCfAuthOrSetupFailure(result)) {
      // An auth/setup failure is an environment problem, not schema evidence;
      // warn and continue so it is never reported as drift or a set mismatch.
      warn(summarizeFailure('cf', result));
      return null;
    }
    throw new Error(summarizeFailure('cf', result));
  }

  return result;
}

async function runPreviewPreflightParity({
  source,
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cfRunner,
  wranglerRunner,
  warn = (message) => process.stderr.write(`cloudflare-d1-preflight-parity: ${message}\n`),
  // CI evidence runs must fail closed on cf auth/setup failures, matching the
  // Phase B contract. The warn-and-continue path exists only as a library
  // option for a future e2e-embedded caller that prefers to proceed without
  // schema evidence, mirroring the incumbent preflight's auth tolerance.
  allowCfAuthSetupSkip = false,
} = {}) {
  if (typeof source !== 'string') throw new Error('wrangler config source is required');
  assertCredentials(env);
  validateTimeout(timeoutMs, 'timeoutMs');

  const queries = previewSchemaCheckQueries();
  const matchedColumns = new Set();
  const skippedQueries = [];

  for (const sql of queries) {
    // Wrangler runs first as the incumbent reference; cf runs only after a
    // successful Wrangler read of the same statement.
    const wranglerResult = await runWranglerWithContract({ sql, timeoutMs, env, wranglerRunner });
    const wranglerLabels = parsePresentColumns(wranglerResult.stdout);

    const cfResult = await runCfWithContract({ sql, source, timeoutMs, env, cfRunner, warn });
    if (cfResult === null) {
      if (!allowCfAuthSetupSkip) {
        throw new Error('cf preview schema-check query failed with an auth/setup error (see warning above)');
      }
      skippedQueries.push(sql);
      continue;
    }

    const cfLabels = parseCfQueryLabels(cfResult.stdout);
    const comparison = compareColumnLabels(wranglerLabels, cfLabels);
    if (!comparison.ok) {
      throw new Error(
        `preview schema-check mismatch: Wrangler-only [${comparison.wranglerOnly.join(', ')}]; cf-only [${comparison.cfOnly.join(', ')}]`,
      );
    }
    for (const label of cfLabels) matchedColumns.add(label);
  }

  // Both sides must have returned at least one required-column row in total:
  // an all-empty comparison cannot distinguish "schema is fine" from a silent
  // empty response, so it fails closed per the Phase D contract.
  if (skippedQueries.length === 0 && matchedColumns.size === 0) {
    throw new Error('preview schema-check comparison produced no required-column rows on either side');
  }

  return Object.freeze({
    ok: true,
    environment: 'preview',
    queriesCompared: queries.length - skippedQueries.length,
    queriesSkipped: skippedQueries.length,
    matchedColumns: Object.freeze([...matchedColumns].sort()),
  });
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error('this command is preview-only and accepts no arguments');
  }
  const configPath = path.resolve(__dirname, '..', 'wrangler.toml');
  const source = fs.readFileSync(configPath, 'utf8');
  const result = await runPreviewPreflightParity({ source, env: process.env });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cloudflare-d1-preflight-parity: ${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_KILL_GRACE_MS,
  DEFAULT_TIMEOUT_MS,
  TRANSIENT_EMPTY_OUTPUT_RETRIES,
  compareColumnLabels,
  hasEmptyOutput,
  isCfAuthOrSetupFailure,
  parseCfQueryLabels,
  runPreviewPreflightParity,
  runWranglerPreflightQuery,
  wranglerPreflightArgs,
};
