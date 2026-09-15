#!/usr/bin/env node

const { spawnSync } = require('child_process');

function normalizePath(value) {
  return String(value ?? '')
    .replace(/^\.\//, '')
    .replace(/^smkc-score-app\//, '');
}

function isPrismaMigration(filePath) {
  return /^prisma\/migrations\/.+\/migration\.sql$/.test(normalizePath(filePath));
}

function isD1Migration(filePath) {
  return /^migrations\/.+\.sql$/.test(normalizePath(filePath));
}

function isManagedMigration(filePath) {
  return isPrismaMigration(filePath) || isD1Migration(filePath);
}

function readDiff() {
  if (Object.prototype.hasOwnProperty.call(process.env, 'MIGRATION_DIFF_INPUT')) {
    return process.env.MIGRATION_DIFF_INPUT;
  }

  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA;
  if (!baseSha || !headSha) {
    throw new Error('BASE_SHA and HEAD_SHA are required when MIGRATION_DIFF_INPUT is not set');
  }

  const result = spawnSync(
    'git',
    [
      'diff',
      '--name-status',
      '--find-renames',
      baseSha,
      headSha,
      '--',
      'prisma/migrations',
      'migrations',
    ],
    { encoding: 'utf8' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git diff exited with status ${result.status}`);
  }

  return result.stdout;
}

function analyzeDiff(diffOutput) {
  let prismaAdded = 0;
  let d1Added = 0;
  const violations = [];

  for (const line of String(diffOutput).split(/\r?\n/)) {
    if (!line) continue;

    const [status, path1 = '', path2 = ''] = line.split('\t');
    if (!status) continue;

    if (status === 'A') {
      if (isPrismaMigration(path1)) prismaAdded += 1;
      else if (isD1Migration(path1)) d1Added += 1;
      continue;
    }

    // Rename statuses include a similarity suffix (for example R100). Any
    // non-additive operation touching either side of managed migration history
    // is rejected because an already-applied migration must remain immutable.
    if (isManagedMigration(path1) || isManagedMigration(path2)) {
      violations.push({ status, from: path1, to: path2 || null });
    }
  }

  return {
    ok: violations.length === 0 && prismaAdded === d1Added,
    prismaAdded,
    d1Added,
    parityOk: prismaAdded === d1Added,
    violations,
  };
}

function printHuman(result) {
  if (result.violations.length > 0) {
    console.error(
      '::error::Existing migration history is immutable. Add a new migration instead of modifying, deleting, or renaming an existing migration file.',
    );
    for (const violation of result.violations) {
      const target = violation.to ? `${violation.from} -> ${violation.to}` : violation.from;
      console.error(`Rejected migration change: ${violation.status}: ${target}`);
    }
  }

  if (!result.parityOk) {
    console.error(
      `::error::This PR adds ${result.prismaAdded} Prisma migration(s) but ${result.d1Added} D1 migration file(s); they must match 1:1.`,
    );
    console.error(
      'D1 (Cloudflare Workers) does not read prisma/migrations; add the equivalent SQL under smkc-score-app/migrations/.',
    );
  }

  if (result.ok) {
    console.log(
      `Migration history check passed: ${result.prismaAdded} Prisma addition(s), ${result.d1Added} D1 addition(s), no existing migration rewrites.`,
    );
  }
}

try {
  const result = analyzeDiff(readDiff());
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else printHuman(result);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: false, error: message }));
  } else {
    console.error(`::error::Migration history check could not run: ${message}`);
  }
  process.exitCode = 1;
}
