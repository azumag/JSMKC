'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REVIEW_SCHEMA_VERSION = 1;
const PRISMA_V7_REVIEW_PROBES = Object.freeze([
  Object.freeze({ key: 'readiness', script: 'prisma-v7-readiness.cjs' }),
  Object.freeze({ key: 'driverAdapter', script: 'prisma-v7-driver-adapter.cjs' }),
  Object.freeze({ key: 'typescriptPrerequisites', script: 'prisma-v7-typescript-prereqs.cjs' }),
  Object.freeze({ key: 'environmentLoading', script: 'prisma-v7-env-loading.cjs' }),
  Object.freeze({ key: 'removedSurfaces', script: 'prisma-v7-removed-surfaces.cjs' }),
  Object.freeze({ key: 'supportSurface', script: 'prisma-v7-support-surface.cjs' }),
  Object.freeze({ key: 'esmSurface', script: 'prisma-v7-esm-surface.cjs' }),
]);

function parseCliOptions(argv = process.argv.slice(2)) {
  if (argv.length === 0) return {};
  throw new Error(`unsupported option: ${argv.join(' ')}`);
}

function parseProbeJson(probeKey, stdout) {
  if (typeof stdout !== 'string' || stdout.trim() === '') {
    throw new Error(`${probeKey} probe returned empty JSON evidence`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${probeKey} probe returned invalid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${probeKey} probe JSON evidence must be an object`);
  }

  return parsed;
}

function runProbe(probe, { cwd = process.cwd(), env = process.env } = {}) {
  const result = spawnSync(process.execPath, [path.join(__dirname, probe.script), '--json'], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`${probe.key} probe could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const detail = stderr ? `: ${stderr}` : '';
    throw new Error(`${probe.key} probe failed with exit code ${result.status}${detail}`);
  }

  return parseProbeJson(probe.key, result.stdout);
}

function collectPrismaV7ReviewEvidence({ run = runProbe } = {}) {
  const probes = Object.fromEntries(PRISMA_V7_REVIEW_PROBES.map((probe) => [probe.key, run(probe)]));

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    probeCount: PRISMA_V7_REVIEW_PROBES.length,
    probes,
  };
}

function main() {
  try {
    parseCliOptions();
    const evidence = collectPrismaV7ReviewEvidence();
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    process.stderr.write(`Failed to collect Prisma 7 review JSON evidence: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  PRISMA_V7_REVIEW_PROBES,
  REVIEW_SCHEMA_VERSION,
  collectPrismaV7ReviewEvidence,
  parseCliOptions,
  parseProbeJson,
  runProbe,
};
