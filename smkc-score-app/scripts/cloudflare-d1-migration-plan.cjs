'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { resolveD1Target } = require('./cloudflare-d1-target.cjs');

const OPERATIONS = new Set(['list', 'apply']);

function planD1Migration(source, environment, operation) {
  if (!OPERATIONS.has(operation)) {
    throw new Error('operation must be exactly "list" or "apply"');
  }

  const target = resolveD1Target(source, environment);
  const args = ['d1', 'migrations', operation, target.databaseId];

  if (operation === 'apply') {
    args.push('--dir', target.migrationsDir);
  }

  return Object.freeze({
    command: 'cf',
    args: Object.freeze(args),
    environment: target.environment,
    operation,
    databaseId: target.databaseId,
    migrationsDir: target.migrationsDir,
  });
}

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length !== 2) {
    throw new Error(
      'usage: node scripts/cloudflare-d1-migration-plan.cjs <list|apply> <production|preview>',
    );
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
  parseCliOptions,
  planD1Migration,
};
