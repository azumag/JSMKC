import fs from 'node:fs';
import path from 'node:path';

import {
  assertSecurityAuditIdentityContract,
  extractSingleQuotedConst,
  getSecurityAuditIdentityContract,
} from '../../scripts/security-audit-identity-contract.js';

const appRoot = path.resolve(__dirname, '../..');
const auditSource = fs.readFileSync(
  path.join(appRoot, 'scripts', 'security-audit.js'),
  'utf8',
);
const statusSource = fs.readFileSync(
  path.join(appRoot, 'scripts', 'security-audit-status.js'),
  'utf8',
);

const alignedAuditSource = [
  "const ALLOWED_ADVISORY = 'GHSA-example';",
  "const ALLOWED_ADVISORY_RANGE = '<8.0.0';",
].join('\n');
const alignedStatusSource = [
  "const TRACKED_ADVISORY = 'GHSA-example';",
  "const TRACKED_ADVISORY_RANGE = '<8.0.0';",
].join('\n');

describe('security audit identity contract', () => {
  it('keeps the status evidence identity aligned with the blocking audit exception', () => {
    expect(
      assertSecurityAuditIdentityContract(auditSource, statusSource),
    ).toEqual({
      auditAdvisory: 'GHSA-ggr8-5vv4-36mx',
      auditAdvisoryRange: '<8.0.0',
      statusAdvisory: 'GHSA-ggr8-5vv4-36mx',
      statusAdvisoryRange: '<8.0.0',
    });
  });

  it('fails closed when the advisory identity drifts', () => {
    expect(() =>
      assertSecurityAuditIdentityContract(
        alignedAuditSource,
        alignedStatusSource.replace('GHSA-example', 'GHSA-drifted'),
      ),
    ).toThrow('security audit advisory identity drift');
  });

  it('fails closed when the advisory range drifts', () => {
    expect(() =>
      assertSecurityAuditIdentityContract(
        alignedAuditSource,
        alignedStatusSource.replace('<8.0.0', '<9.0.0'),
      ),
    ).toThrow('security audit advisory range drift');
  });

  it('requires each tracked declaration to be unique', () => {
    expect(() =>
      getSecurityAuditIdentityContract(
        `${alignedAuditSource}\nconst ALLOWED_ADVISORY = 'GHSA-duplicate';`,
        alignedStatusSource,
      ),
    ).toThrow('expected exactly one ALLOWED_ADVISORY declaration, found 2');
  });

  it('fails closed when a tracked declaration disappears or changes syntax', () => {
    expect(() => extractSingleQuotedConst('', 'ALLOWED_ADVISORY')).toThrow(
      'expected exactly one ALLOWED_ADVISORY declaration, found 0',
    );
    expect(() =>
      extractSingleQuotedConst(
        'const ALLOWED_ADVISORY = `GHSA-example`;',
        'ALLOWED_ADVISORY',
      ),
    ).toThrow('expected exactly one ALLOWED_ADVISORY declaration, found 0');
  });
});
