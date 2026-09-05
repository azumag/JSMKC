'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const ALLOWED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';
const ALLOWED_ADVISORY_RANGE = '<8.0.0';
const ALLOWED_ROOT = 'deepmerge-ts';
const ALLOWED_NODE = 'node_modules/deepmerge-ts';
const ALLOWED_VERSION = '7.1.5';
const ALLOWED_RESOLVED = 'https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-7.1.5.tgz';
const ALLOWED_INTEGRITY =
  'sha512-HOJkrhaYsweh+W+e74Yn7YStZOilkoPb6fycpwNLKzSPtruFs48nYis0zy5yJz1+ktUhHxoRDJ27RQAWLIJVJw==';
const ALLOWED_PRISMA_DEV_RANGE = '^6.19.3';
const ALLOWED_PRISMA_NODE = 'node_modules/prisma';
const ALLOWED_PRISMA_CONFIG_NODE = 'node_modules/@prisma/config';
const ALLOWED_PRISMA_VERSION = '6.19.3';
const ALLOWED_PRISMA_CONFIG_VERSION = '6.19.3';
const ALLOWED_PRISMA_RESOLVED = 'https://registry.npmjs.org/prisma/-/prisma-6.19.3.tgz';
const ALLOWED_PRISMA_CONFIG_RESOLVED = 'https://registry.npmjs.org/@prisma/config/-/config-6.19.3.tgz';
const ALLOWED_PRISMA_INTEGRITY =
  'sha512-++ZJ0ijLrDJF6hNB4t4uxg2br3fC4H9Yc9tcbjr2fcNFP3rh/SBNrAgjhsqBU4Ght8JPrVofG/ZkXfnSfnYsFg==';
const ALLOWED_PRISMA_CONFIG_INTEGRITY =
  'sha512-CBPT44BjlQxEt8kiMEauji2WHTDoVBOKl7UlewXmUgBPnr/oPRZC3psci5chJnYmH0ivEIog2OU9PGWoki3DLQ==';
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
  return (
    entry?.name === ALLOWED_ROOT &&
    entry?.dependency === ALLOWED_ROOT &&
    entry?.severity === 'high' &&
    url === `https://github.com/advisories/${ALLOWED_ADVISORY}` &&
    entry?.range === ALLOWED_ADVISORY_RANGE
  );
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

function hasConsistentBlockingSummary(report, blockingEntries) {
  const summary = report?.metadata?.vulnerabilities;
  if (summary === undefined) {
    return true;
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return false;
  }

  const high = summary.high ?? 0;
  const critical = summary.critical ?? 0;
  if (![high, critical].every((count) => Number.isInteger(count) && count >= 0)) {
    return false;
  }

  const graphHigh = blockingEntries.filter(([, vulnerability]) => vulnerability?.severity === 'high').length;
  const graphCritical = blockingEntries.filter(([, vulnerability]) => vulnerability?.severity === 'critical').length;
  return high === graphHigh && critical === graphCritical;
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

  if (!hasConsistentBlockingSummary(report, blockingEntries)) {
    return { ok: false, allowed: [], unexpected: ['invalid-audit-report'] };
  }

  if (blockingEntries.length === 0) {
    return { ok: true, allowed: [], unexpected: [] };
  }

  const deepmergeLock = lockfile?.packages?.[ALLOWED_NODE];
  const prismaLock = lockfile?.packages?.[ALLOWED_PRISMA_NODE];
  const prismaConfigLock = lockfile?.packages?.[ALLOWED_PRISMA_CONFIG_NODE];
  const rootPackage = lockfile?.packages?.[''];
  const prismaDevRange = rootPackage?.devDependencies?.prisma;
  const prismaIsExpectedDevOnly =
    prismaDevRange === ALLOWED_PRISMA_DEV_RANGE && !Boolean(rootPackage?.dependencies?.prisma);
  const prismaContextIsExpected =
    prismaLock?.version === ALLOWED_PRISMA_VERSION &&
    prismaLock?.resolved === ALLOWED_PRISMA_RESOLVED &&
    prismaLock?.integrity === ALLOWED_PRISMA_INTEGRITY &&
    prismaLock?.devOptional === true &&
    prismaLock?.dependencies?.['@prisma/config'] === ALLOWED_PRISMA_CONFIG_VERSION &&
    prismaConfigLock?.version === ALLOWED_PRISMA_CONFIG_VERSION &&
    prismaConfigLock?.resolved === ALLOWED_PRISMA_CONFIG_RESOLVED &&
    prismaConfigLock?.integrity === ALLOWED_PRISMA_CONFIG_INTEGRITY &&
    prismaConfigLock?.devOptional === true &&
    prismaConfigLock?.dependencies?.['deepmerge-ts'] === ALLOWED_VERSION;
  const expectedLockState =
    deepmergeLock?.version === ALLOWED_VERSION &&
    deepmergeLock?.resolved === ALLOWED_RESOLVED &&
    deepmergeLock?.integrity === ALLOWED_INTEGRITY &&
    deepmergeLock?.devOptional === true &&
    prismaIsExpectedDevOnly &&
    prismaContextIsExpected;

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
      `The exception is pinned to the canonical deepmerge-ts ${ALLOWED_VERSION} npm artifact and the canonical installed Prisma ${ALLOWED_PRISMA_VERSION} -> @prisma/config ${ALLOWED_PRISMA_CONFIG_VERSION} -> deepmerge-ts ${ALLOWED_VERSION} lockfile context as dev-only; it will fail closed if the package source, integrity, dependency graph, severity, advisory metadata or lock state changes.\n`,
    );
  } else {
    process.stdout.write('npm audit: no high/critical vulnerabilities found.\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = { evaluateAuditReport };
