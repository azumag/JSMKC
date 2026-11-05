'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { planD1Migration } = require('./cloudflare-d1-migration-plan.cjs');
const { runCfPlan } = require('./cloudflare-cf-runner.cjs');

const DEFAULT_TIMEOUT_MS = 30_000;

// Operational wrapper for the cf-first migration-list switch (JSMKC#4240
// Phase C). stdout carries only the cf JSON result so downstream consumers
// (the d1-migration-audit.cjs parser) see a stable contract; every diagnostic
// goes to stderr and any failure exits nonzero (fail closed).
function assertCredentials(env) {
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (typeof env[key] !== 'string' || env[key].length === 0) {
      throw new Error(`${key} is required for the cf d1 migrations command`);
    }
  }
}

function parseCliOptions(argv = process.argv.slice(2)) {
  const [operation, environment] = argv;
  if (argv.length !== 2 || operation !== 'list') {
    throw new Error('usage: node scripts/cloudflare-d1-migrations.cjs list <production|preview>');
  }
  if (environment !== 'production' && environment !== 'preview') {
    throw new Error('environment must be exactly "production" or "preview"');
  }
  return { operation, environment };
}

async function runList({ source, environment, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, cfRunner }) {
  assertCredentials(env);
  const plan = planD1Migration(source, environment, 'list');
  const run = cfRunner || ((selectedPlan, options) => runCfPlan(selectedPlan, options));
  const result = await run(plan, { timeoutMs, env });
  if (!result.ok) {
    const detail = String(result.stderr || '').trim();
    throw new Error(
      `cf d1 migrations list failed${result.timedOut ? ' (timed out)' : ''}${detail ? `: ${detail}` : ''}`,
    );
  }
  return result.stdout;
}

async function main() {
  const { environment } = parseCliOptions();
  const configPath = path.resolve(__dirname, '..', 'wrangler.toml');
  const source = fs.readFileSync(configPath, 'utf8');
  const stdout = await runList({ source, environment, env: process.env });
  process.stdout.write(`${String(stdout).trimEnd()}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cloudflare-d1-migrations: ${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertCredentials,
  parseCliOptions,
  runList,
};
