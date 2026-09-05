'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const ALLOWED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';
const ALLOWED_ADVISORY_RANGE = '<8.0.0';
const ALLOWED_ROOT = 'deepmerge-ts';
const ALLOWED_NODE = 'node_modules/deepmerge-ts';
const ALLOWED_VERSION = '7.1.5';
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function objectViaEntries(vulnerability) {
  return (vulnerability?.via || []).filter((entry) => entry && typeof entry === 'object');
}

function stringViaEntries(vulnerability) {
  return (vulnerability?.via || []).filter((entry) => typeof entry === 'string');
}

function isExpectedDirectAdvisory(entry) {
  const url = String(entry?.url || '');
  return url.endsWith(`/${ALLOWED_ADVISORY}`) && entry?.range === ALLOWED_ADVISORY_RANGE;
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
  const prismaIsDevOnly = Boolean(rootPackage?.devDependencies?.prisma) && !Boolean(rootPackage?.dependencies?.prisma);
  const expectedLockState =
    deepmergeLock?.version === ALLOWED_VERSION && deepmergeLock?.devOptional === true && prismaIsDevOnly;

  const rootVulnerability = vulnerabilities[ALLOWED_ROOT];
  const rootHasExpectedAdvisory = objectViaEntries(rootVulnerability).some(isExpectedDirectAdvisory);

  if (!expectedLockState || !rootHasExpectedAdvisory) {
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
    const hasDifferentDirectAdvisory = objectViaEntries(vulnerability).some((entry) => !isExpectedDirectAdvisory(entry));
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
      'The exception is pinned to deepmerge-ts 7.1.5 as devOptional and will fail closed if the dependency graph, severity, advisory metadata or lock state changes.\n',
    );
  } else {
    process.stdout.write('npm audit: no high/critical vulnerabilities found.\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = { evaluateAuditReport };
