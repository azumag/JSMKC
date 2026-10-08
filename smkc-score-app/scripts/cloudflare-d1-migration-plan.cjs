'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { resolveD1Target } = require('./cloudflare-d1-target.cjs');
const { VERIFIED_TOOLS } = require('./cloudflare-cf-parity.cjs');

const OPERATIONS = new Set(['list', 'apply']);
// Surfaces the cf CLI still cannot cover. They fail closed here instead of
// producing a command that would silently do something else; see
// docs/cloudflare-d1-cf-parity.md.
const UNSUPPORTED_OPERATIONS = new Set(['export', 'import']);

function migrationPattern(migrationsDir) {
  // cf discovers migrations with a single glob that does not merge with the
  // default, so the plan states it explicitly and keeps the discovered file set
  // identical to the current Wrangler behaviour.
  return `${migrationsDir}/*.sql`;
}

function planD1Migration(source, environment, operation) {
  if (UNSUPPORTED_OPERATIONS.has(operation)) {
    throw new Error(
      `operation "${operation}" has no cf equivalent in ${VERIFIED_TOOLS.cf}; keep the Wrangler fallback described in docs/cloudflare-d1-cf-parity.md`,
    );
  }
  if (!OPERATIONS.has(operation)) {
    throw new Error('operation must be exactly "list" or "apply"');
  }

  const target = resolveD1Target(source, environment);
  const pattern = migrationPattern(target.migrationsDir);
  const args = ['d1', 'migrations', operation, target.databaseId];

  if (operation === 'apply') {
    args.push('--dir', target.migrationsDir);
  }
  args.push('--pattern', pattern);

  return Object.freeze({
    command: 'cf',
    args: Object.freeze(args),
    environment: target.environment,
    operation,
    databaseId: target.databaseId,
    migrationsDir: target.migrationsDir,
    pattern,
  });
}

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length !== 2) {
    throw new Error('usage: node scripts/cloudflare-d1-migration-plan.cjs <list|apply> <production|preview>');
  }

  return {
    operation: argv[0],
    environment: argv[1],
  };
}

function main() {
  const { operation, environment } = parseCliOptions();
  const configPath = path.resolve(__dirname, '..', 'wrangler.toml');
  const source = fs.readFileSync(configPath, 'utf8');
  const plan = planD1Migration(source, environment, operation);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cloudflare-d1-migration-plan: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  OPERATIONS,
  UNSUPPORTED_OPERATIONS,
  migrationPattern,
  parseCliOptions,
  planD1Migration,
};
