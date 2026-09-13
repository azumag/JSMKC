'use strict';

const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSingleQuotedConst(source, constantName) {
  if (typeof source !== 'string') {
    throw new TypeError(`${constantName} source must be a string`);
  }

  const pattern = new RegExp(
    `\\bconst\\s+${escapeRegExp(constantName)}\\s*=\\s*'([^'\\r\\n]*)'\\s*;`,
    'g',
  );
  const matches = [...source.matchAll(pattern)];

  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${constantName} declaration, found ${matches.length}`);
  }

  return matches[0][1];
}

function getSecurityAuditIdentityContract(auditSource, statusSource) {
  return {
    auditAdvisory: extractSingleQuotedConst(auditSource, 'ALLOWED_ADVISORY'),
    auditAdvisoryRange: extractSingleQuotedConst(auditSource, 'ALLOWED_ADVISORY_RANGE'),
    statusAdvisory: extractSingleQuotedConst(statusSource, 'TRACKED_ADVISORY'),
    statusAdvisoryRange: extractSingleQuotedConst(statusSource, 'TRACKED_ADVISORY_RANGE'),
  };
}

function assertSecurityAuditIdentityContract(auditSource, statusSource) {
  const identity = getSecurityAuditIdentityContract(auditSource, statusSource);

  if (identity.auditAdvisory !== identity.statusAdvisory) {
    throw new Error(
      `security audit advisory identity drift: helper=${identity.auditAdvisory}, status=${identity.statusAdvisory}`,
    );
  }

  if (identity.auditAdvisoryRange !== identity.statusAdvisoryRange) {
    throw new Error(
      `security audit advisory range drift: helper=${identity.auditAdvisoryRange}, status=${identity.statusAdvisoryRange}`,
    );
  }

  return identity;
}

function main() {
  const auditSource = fs.readFileSync(path.join(__dirname, 'security-audit.js'), 'utf8');
  const statusSource = fs.readFileSync(path.join(__dirname, 'security-audit-status.js'), 'utf8');
  const identity = assertSecurityAuditIdentityContract(auditSource, statusSource);

  process.stdout.write(
    `security audit identity contract: ${identity.auditAdvisory} (${identity.auditAdvisoryRange})\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  assertSecurityAuditIdentityContract,
  extractSingleQuotedConst,
  getSecurityAuditIdentityContract,
  main,
};
