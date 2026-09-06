import fs from 'fs';
import path from 'path';

import { hasExpectedSecurityAuditLockfileShape } from '../../scripts/security-audit-lockfile.js';

describe('security audit lockfile preflight', () => {
  it('accepts the repository package-lock schema used by the temporary audit exception', () => {
    const lockfile = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', 'package-lock.json'), 'utf8'),
    );

    expect(hasExpectedSecurityAuditLockfileShape(lockfile)).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { lockfileVersion: 2, packages: {} },
    { lockfileVersion: 4, packages: {} },
    { lockfileVersion: '3', packages: {} },
    { lockfileVersion: 3 },
    { lockfileVersion: 3, packages: null },
    { lockfileVersion: 3, packages: [] },
  ])('fails closed for unsupported package-lock schema: %p', (lockfile) => {
    expect(hasExpectedSecurityAuditLockfileShape(lockfile)).toBe(false);
  });

  it('runs the lockfile schema preflight before the npm audit helper in CI', () => {
    const ci = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml'),
      'utf8',
    );
    const preflight = 'node scripts/security-audit-lockfile.js';
    const audit = 'node scripts/security-audit.js';

    expect(ci).toContain(preflight);
    expect(ci).toContain(audit);
    expect(ci.indexOf(preflight)).toBeLessThan(ci.indexOf(audit));
  });
});
