'use strict';

const fs = require('node:fs');

const WRANGLER_NO_PENDING_SENTINEL = 'No migrations to apply!';
const CF_EMPTY_MIGRATION_LIST = '[]';

function stripAnsi(value) {
  return String(value || '').replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function meaningfulLines(output) {
  return stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// wrangler 4.152.0+ prefixes the sentinel with a status glyph, e.g. "✅ No migrations to apply!".
// Strip any leading non-alphanumeric decoration (emoji/symbols/whitespace) before comparing so the
// sentinel match stays robust to wrangler's output formatting changes.
function stripLeadingDecoration(line) {
  return line.replace(/^[^\p{L}\p{N}]+/u, '');
}

function classifyNoPendingMigrations(output) {
  const lines = meaningfulLines(output);

  if (lines.some((line) => stripLeadingDecoration(line) === WRANGLER_NO_PENDING_SENTINEL)) {
    return Object.freeze({ ok: true, format: 'wrangler-text' });
  }

  if (lines.length > 0 && lines[lines.length - 1] === CF_EMPTY_MIGRATION_LIST) {
    return Object.freeze({ ok: true, format: 'cf-json-empty' });
  }

  return Object.freeze({ ok: false, format: null });
}

function assertNoPendingMigrations(output) {
  const result = classifyNoPendingMigrations(output);
  if (!result.ok) {
    throw new Error('D1 migrations may remain unapplied; expected Wrangler no-pending sentinel or cf empty list []');
  }
  return result;
}

function main() {
  const output = fs.readFileSync(0, 'utf8');
  const result = assertNoPendingMigrations(output);
  process.stdout.write(`d1-migration-audit: no pending migrations (${result.format})\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`d1-migration-audit: ${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  CF_EMPTY_MIGRATION_LIST,
  WRANGLER_NO_PENDING_SENTINEL,
  assertNoPendingMigrations,
  classifyNoPendingMigrations,
  meaningfulLines,
};
