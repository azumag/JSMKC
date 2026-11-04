'use strict';

const { spawn } = require('node:child_process');

const ALLOWED_OPERATIONS = new Set(['list', 'apply', 'query']);
const ALLOWED_ENVIRONMENTS = new Set(['production', 'preview']);
const D1_DATABASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_ENV_KEY = /(TOKEN|SECRET|PASSWORD|PASS|KEY|AUTH|CREDENTIAL)/i;
const DEFAULT_KILL_GRACE_MS = 1_000;

function expectedArgs(plan) {
  if (plan.operation === 'query') {
    return ['d1', 'query', plan.databaseId, '--sql', plan.sql];
  }
  return ['d1', 'migrations', plan.operation, plan.databaseId, '--dir', plan.migrationsDir, '--pattern', plan.pattern];
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${name} must be a non-empty string without NUL bytes`);
  }
}

function validateCfPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('plan must be an object produced by cloudflare-d1-migration-plan.cjs');
  }
  if (plan.command !== 'cf') {
    throw new Error('plan.command must be exactly "cf"');
  }
  if (!ALLOWED_OPERATIONS.has(plan.operation)) {
    throw new Error('plan.operation must be exactly "list", "apply", or "query"');
  }
  if (!ALLOWED_ENVIRONMENTS.has(plan.environment)) {
    throw new Error('plan.environment must be exactly "production" or "preview"');
  }
  assertNonEmptyString(plan.databaseId, 'plan.databaseId');
  if (!D1_DATABASE_ID.test(plan.databaseId)) {
    throw new Error('plan.databaseId must be a D1 UUID');
  }

  if (plan.operation === 'query') {
    // The d1 query surface is read-only and preview-only (JSMKC#4240 Phase D).
    // plan.sql must be an exact member of the caller-provided allowlist, which
    // the plan builder fills with the generated preview schema-check
    // statements, so arbitrary SQL can never reach the bounded runner.
    if (plan.environment !== 'preview') {
      throw new Error('plan.operation "query" is preview-only');
    }
    assertNonEmptyString(plan.sql, 'plan.sql');
    if (
      !Array.isArray(plan.allowedSql) ||
      plan.allowedSql.some((entry) => typeof entry !== 'string' || entry.length === 0)
    ) {
      throw new Error('plan.allowedSql must be an array of non-empty strings');
    }
    if (!plan.allowedSql.includes(plan.sql)) {
      throw new Error('plan.sql must be an exact member of plan.allowedSql');
    }
  } else {
    assertNonEmptyString(plan.migrationsDir, 'plan.migrationsDir');
    assertNonEmptyString(plan.pattern, 'plan.pattern');
    if (plan.pattern !== `${plan.migrationsDir}/*.sql`) {
      throw new Error('plan.pattern must exactly match <migrationsDir>/*.sql');
    }
  }
  if (!Array.isArray(plan.args) || plan.args.some((arg) => typeof arg !== 'string')) {
    throw new Error('plan.args must be an array of strings');
  }

  const expected = expectedArgs(plan);
  if (plan.args.length !== expected.length || plan.args.some((arg, index) => arg !== expected[index])) {
    throw new Error('plan.args does not match the repository-owned D1 migration command shape');
  }

  return plan;
}

function validateTimeout(timeoutMs, name = 'timeoutMs') {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function sensitiveValues(env) {
  return Object.entries(env || {})
    .filter(([key, value]) => SENSITIVE_ENV_KEY.test(key) && typeof value === 'string' && value.length >= 4)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

function redactSensitiveText(text, env = process.env) {
  let redacted = String(text ?? '');
  for (const value of sensitiveValues(env)) {
    redacted = redacted.split(value).join('[REDACTED]');
  }
  return redacted;
}

function terminateProcessTree(child, signal, { platform = process.platform, killFn = process.kill } = {}) {
  if (!child) return;

  if (platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
    try {
      killFn(-child.pid, signal);
      return;
    } catch (error) {
      if (!error || error.code !== 'ESRCH') {
        try {
          child.kill(signal);
        } catch {
          // The child may already have exited between the group kill and fallback.
        }
        return;
      }
    }
  }

  try {
    child.kill(signal);
  } catch {
    // A concurrent exit is equivalent to successful termination for this runner.
  }
}

function runCfPlan(
  plan,
  {
    timeoutMs,
    killGraceMs = DEFAULT_KILL_GRACE_MS,
    cwd = process.cwd(),
    env = process.env,
    spawnImpl = spawn,
    terminateImpl = terminateProcessTree,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    platform = process.platform,
  } = {},
) {
  validateCfPlan(plan);
  validateTimeout(timeoutMs);
  validateTimeout(killGraceMs, 'killGraceMs');

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let timedOut = false;
    let settled = false;
    let timeoutHandle = null;
    let forceKillHandle = null;

    const child = spawnImpl(plan.command, [...plan.args], {
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
          command: plan.command,
          args: Object.freeze([...plan.args]),
          environment: plan.environment,
          operation: plan.operation,
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

module.exports = {
  ALLOWED_ENVIRONMENTS,
  ALLOWED_OPERATIONS,
  DEFAULT_KILL_GRACE_MS,
  expectedArgs,
  redactSensitiveText,
  runCfPlan,
  terminateProcessTree,
  validateCfPlan,
};
