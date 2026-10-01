'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGET_SECTIONS = Object.freeze({
  production: 'd1_databases',
  preview: 'env.preview.d1_databases',
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STRING_ASSIGNMENT_PATTERN = /^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*(?:#.*)?$/;

function parseD1Tables(source) {
  if (typeof source !== 'string') throw new Error('wrangler config must be a string');

  const tables = new Map(Object.values(TARGET_SECTIONS).map((section) => [section, []]));
  let current = null;

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const arrayTable = /^\[\[([^\]]+)\]\]\s*(?:#.*)?$/.exec(line);
    if (arrayTable) {
      const section = arrayTable[1].trim();
      if (tables.has(section)) {
        current = {};
        tables.get(section).push(current);
      } else {
        current = null;
      }
      continue;
    }

    if (/^\[[^\]]+\]\s*(?:#.*)?$/.test(line)) {
      current = null;
      continue;
    }

    if (!current) continue;

    const assignment = STRING_ASSIGNMENT_PATTERN.exec(line);
    if (!assignment) {
      if (/^(binding|database_id|migrations_dir)\s*=/.test(line)) {
        throw new Error(`unsupported D1 string assignment at line ${index + 1}`);
      }
      continue;
    }

    const [, key, value] = assignment;
    if (!['binding', 'database_id', 'migrations_dir'].includes(key)) continue;
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      throw new Error(`duplicate ${key} in D1 table at line ${index + 1}`);
    }
    current[key] = value;
  }

  return tables;
}

function selectDbBinding(tables, section, label) {
  const entries = tables.get(section) ?? [];
  const matches = entries.filter((entry) => entry.binding === 'DB');
  if (matches.length !== 1) {
    throw new Error(`${label} must define exactly one D1 binding named DB; found ${matches.length}`);
  }

  const target = matches[0];
  if (!UUID_PATTERN.test(target.database_id ?? '')) {
    throw new Error(`${label} DB database_id must be a UUID`);
  }
  if (target.migrations_dir !== 'migrations') {
    throw new Error(`${label} DB migrations_dir must be "migrations"`);
  }

  return target;
}

function resolveD1Target(source, environment) {
  if (!Object.prototype.hasOwnProperty.call(TARGET_SECTIONS, environment)) {
    throw new Error('environment must be exactly "production" or "preview"');
  }

  const tables = parseD1Tables(source);
  const production = selectDbBinding(tables, TARGET_SECTIONS.production, 'production');
  const preview = selectDbBinding(tables, TARGET_SECTIONS.preview, 'preview');

  if (production.database_id.toLowerCase() === preview.database_id.toLowerCase()) {
    throw new Error('production and preview DB database_id values must be distinct');
  }

  const target = environment === 'production' ? production : preview;
  return Object.freeze({
    environment,
    databaseId: target.database_id,
    migrationsDir: target.migrations_dir,
  });
}

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    throw new Error('usage: node scripts/cloudflare-d1-target.cjs <production|preview>');
  }
  return { environment: argv[0] };
}

function main() {
  const { environment } = parseCliOptions();
  const configPath = path.resolve(__dirname, '..', 'wrangler.toml');
  const source = fs.readFileSync(configPath, 'utf8');
  const target = resolveD1Target(source, environment);
  process.stdout.write(`${target.databaseId}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cloudflare-d1-target: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCliOptions,
  parseD1Tables,
  resolveD1Target,
};
