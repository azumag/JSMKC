import { readFileSync } from 'node:fs';

import { isExpectedAuditExitStatus } from '../../scripts/security-audit.js';

describe('security audit process exit status', () => {
  it.each([0, 1])('accepts npm audit exit status %i as a parseable audit result', (status) => {
    expect(isExpectedAuditExitStatus(status)).toBe(true);
  });

  it.each([2, 3, 127, null, undefined])('fails closed for unexpected npm audit exit status %p', (status) => {
    expect(isExpectedAuditExitStatus(status)).toBe(false);
  });

  it('checks the spawned npm audit status before parsing its JSON', () => {
    const helperSource = readFileSync('scripts/security-audit.js', 'utf8');

    expect(helperSource).toContain('!isExpectedAuditExitStatus(audit.status)');
  });
});
