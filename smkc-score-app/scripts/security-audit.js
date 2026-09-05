'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const ALLOWED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';
const ALLOWED_ADVISORY_RANGE = '<8.0.0';
const ALLOWED_ROOT = 'deepmerge-ts';
const ALLOWED_NODE = 'node_modules/deepmerge-ts';
const ALLOWED_VERSION = '7.1.5';
const ALLOWED_PRISMA_DEV_RANGE = '^6.19.3';
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const ALLOWED_GRAPH = {
  'deepmerge-ts': { via: [], effects: ['@prisma/config'] },
  '@prisma/config': { via: ['deepmerge-ts'], effects: ['prisma'] },
  prisma: { via: ['@prisma/config'], effects: [] },
};

function objectViaEntries(vulnerability) {
  return (vulnerability?.via || []).filter((entry) => entry && typeof entry === 'object');
}

function stringViaEntries(vulnerability) {
  return (vulnerability?.via || []).filter((entry) => typeof entry === 'string');
}

function isExpectedDirectAdvisory(entry) {
  const url = String(entry?.url || '');
  return url === `https://github.com/advisories/${ALLOWED_ADVISORY}` && entry?.range === ALLOWED_ADVISORY_RANGE;
}

function sameStringMembers(actual, expected) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((entry) => typeof entry !== 'string')
  ) {
    return false;
  }

  const actualSet = new Set(actual);
  return actualSet.size === expected.length && expected.every((entry) => actualSet.has(entry));
}

function matchesExpectedGraph(vulnerabilities) {
  return Object.entries(ALLOWED_GRAPH).every(([name, expected]) => {
    const vulnerability = vulnerabilities[name];
    if (!vulnerability || vulnerability.severity !== 'high' || !Array.isArray(vulnerability.via)) {
      return false;
    }

    const viaDependencies = stringViaEntries(vulnerability);
    const advisoryEntries = objectViaEntries(vulnerability);
    if (vulnerability.via.length !== viaDependencies.length + advisoryEntries.length) {
      return false;
    }

    if (
      !sameStringMembers(viaDependencies, expected.via) ||
      !sameStringMembers(vulnerability.effects || [], expected.effects)
    ) {
      return false;
    }

    if (name === ALLOWED_ROOT) {
      return advisoryEntries.length === 1 && isExpectedDirectAdvisory(advisoryEntries[0]);
    }

    return advisoryEntries.length === 0;
  });
}

function buildEffectClosure(vulnerabilities, rootName) {
  const closure = new Set([rootName]);
  const queue = [rootName];

  while (queue.length > 0) {
    const current = queue.shift();
    const vulnerability = vulnerabilities[current];
    for (const effect of vulnerability?.effects || []) {
      if (!closure.has(effect)) {
        closure.add(effect);
        queue.push(effect);
      }
    }
  }

  return closure;
}

function evaluateAuditReport(report, lockfile) {
  if (!report || report.error || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    return { ok: false, allowed: [], unexpected: ['invalid-audit-report'] };
  }

  const vulnerabilities = report.vulnerabilities;
  const blockingEntries = Object.entries(vulnerabilities).filter(([, vulnerability]) =>
    BLOCKING_SEVERITIES.has(vulnerability?.severity),
  );

  if (blockingEntries.length === 0) {
    return { ok: true, allowed: [], unexpected: [] };
  }

  const deepmergeLock = lockfile?.packages?.[ALLOWED_NODE];
  const rootPackage = lockfile?.packages?.[''];
  const prismaDevRange = rootPackage?.devDependencies?.prisma;
  const prismaIsExpectedDevOnly =
    prismaDevRange === ALLOWED_PRISMA_DEV_RANGE && !Boolean(rootPackage?.dependencies?.prisma);
  const expectedLockState =
    deepmergeLock?.version === ALLOWED_VERSION && deepmergeLock?.devOptional === true && prismaIsExpectedDevOnly;

  if (!expectedLockState || !matchesExpectedGraph(vulnerabilities)) {
    return {
      ok: false,
      allowed: [],
      unexpected: blockingEntries.map(([name]) => name),
    };
  }

  const closure = buildEffectClosure(vulnerabilities, ALLOWED_ROOT);
  const allowed = [];
  const unexpected = [];

  for (const [name, vulnerability] of blockingEntries) {
    const hasDifferentDirectAdvisory = objectViaEntries(vulnerability).some(
      (entry) => !isExpectedDirectAdvisory(entry),
    );
    const hasUnexpectedViaDependency = stringViaEntries(vulnerability).some((dependency) => !closure.has(dependency));
    const matchesKnownSeverity = vulnerability.severity === 'high';

    if (closure.has(name) && matchesKnownSeverity && !hasDifferentDirectAdvisory && !hasUnexpectedViaDependency) {
      allowed.push(name);
    } else {
      unexpected.push(name);
    }
  }

  return { ok: unexpected.length === 0, allowed, unexpected };
}

function main() {
  const audit = spawnSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (audit.error || audit.signal || !audit.stdout) {
    process.stderr.write(audit.error?.message || audit.stderr || 'npm audit produced no JSON output\n');
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch (error) {
    process.stderr.write(`Failed to parse npm audit JSON: ${error.message}\n`);
    process.stderr.write(audit.stderr || '');
    process.exit(1);
  }

  const lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const result = evaluateAuditReport(report, lockfile);

  if (!result.ok) {
    process.stderr.write(
      `Blocking npm audit finding(s): ${result.unexpected.join(', ') || 'allowlist precondition failed'}\n`,
    );
    process.stderr.write(audit.stdout);
    process.stderr.write(audit.stderr || '');
    process.exit(1);
  }

  if (result.allowed.length > 0) {
    process.stdout.write(
      `Allowed temporary dev-only Prisma audit chain (${ALLOWED_ADVISORY}, ${ALLOWED_ADVISORY_RANGE}): ${result.allowed.join(', ')}\n`,
    );
    process.stdout.write(
      `The exception is pinned to deepmerge-ts ${ALLOWED_VERSION} as devOptional and Prisma ${ALLOWED_PRISMA_DEV_RANGE} as a devDependency; it will fail closed if the dependency graph, severity, advisory metadata or lock state changes.\n`,
    );
  } else {
    process.stdout.write('npm audit: no high/critical vulnerabilities found.\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = { evaluateAuditReport };
