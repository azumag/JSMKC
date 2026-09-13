'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REVIEW_SCHEMA_VERSION = 1;
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_MAX_BUFFER_BYTES = 1024 * 1024;
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

function validateProbeManifest(probes) {
  if (!Array.isArray(probes) || probes.length === 0) {
    throw new Error('Prisma 7 review probe manifest must be a non-empty array');
  }

  const keys = new Set();
  const scripts = new Set();

  for (const [index, probe] of probes.entries()) {
    if (!probe || typeof probe !== 'object' || Array.isArray(probe)) {
      throw new Error(`Prisma 7 review probe manifest entry ${index} must be an object`);
    }

    for (const field of ['key', 'script']) {
      if (typeof probe[field] !== 'string' || probe[field].trim() === '') {
        throw new Error(`Prisma 7 review probe manifest entry ${index} must have a non-empty ${field}`);
      }
    }

    if (keys.has(probe.key)) {
      throw new Error(`Prisma 7 review probe manifest contains duplicate key: ${probe.key}`);
    }
    if (scripts.has(probe.script)) {
      throw new Error(`Prisma 7 review probe manifest contains duplicate script: ${probe.script}`);
    }

    keys.add(probe.key);
    scripts.add(probe.script);
  }

  return probes;
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

function runProbe(
  probe,
  {
    cwd = process.cwd(),
    env = process.env,
    spawn = spawnSync,
    timeoutMs = PROBE_TIMEOUT_MS,
    maxBufferBytes = PROBE_MAX_BUFFER_BYTES,
  } = {},
) {
  const result = spawn(process.execPath, [path.join(__dirname, probe.script), '--json'], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
    maxBuffer: maxBufferBytes,
  });

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`${probe.key} probe timed out after ${timeoutMs}ms`);
    }
    if (result.error.code === 'ENOBUFS') {
      throw new Error(`${probe.key} probe output exceeded ${maxBufferBytes} bytes`);
    }
    throw new Error(`${probe.key} probe could not start: ${result.error.message}`);
  }

  if (result.signal) {
    throw new Error(`${probe.key} probe terminated by signal ${result.signal}`);
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const detail = stderr ? `: ${stderr}` : '';
    throw new Error(`${probe.key} probe failed with exit code ${result.status}${detail}`);
  }

  return parseProbeJson(probe.key, result.stdout);
}

function collectPrismaV7ReviewEvidence({ run = runProbe, probes = PRISMA_V7_REVIEW_PROBES } = {}) {
  validateProbeManifest(probes);
  const evidenceByProbe = Object.fromEntries(probes.map((probe) => [probe.key, run(probe)]));

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    probeCount: probes.length,
    probes: evidenceByProbe,
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
  PROBE_MAX_BUFFER_BYTES,
  PROBE_TIMEOUT_MS,
  REVIEW_SCHEMA_VERSION,
  collectPrismaV7ReviewEvidence,
  parseCliOptions,
  parseProbeJson,
  runProbe,
  validateProbeManifest,
};
