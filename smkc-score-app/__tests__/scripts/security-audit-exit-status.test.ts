import { readFileSync } from 'node:fs';

import { hasConsistentAuditExitStatus, isExpectedAuditExitStatus } from '../../scripts/security-audit.js';

describe('security audit process exit status', () => {
  it.each([0, 1])('accepts npm audit exit status %i as a parseable audit result', (status) => {
    expect(isExpectedAuditExitStatus(status)).toBe(true);
  });

  it.each([2, 3, 127, null, undefined])('fails closed for unexpected npm audit exit status %p', (status) => {
    expect(isExpectedAuditExitStatus(status)).toBe(false);
  });

  it.each([
    [0, { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }],
    [0, { info: 2, low: 0, moderate: 0, high: 0, critical: 0, total: 2 }],
    [1, { info: 0, low: 1, moderate: 0, high: 0, critical: 0, total: 1 }],
    [1, { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 }],
    [1, { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 }],
    [1, { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 }],
  ])('matches npm audit --audit-level=low exit status %i to summary %p', (status, vulnerabilities) => {
    expect(hasConsistentAuditExitStatus({ metadata: { vulnerabilities } }, status)).toBe(true);
  });

  it.each([
    [1, { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }],
    [0, { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 }],
  ])('fails closed when exit status %i disagrees with summary %p', (status, vulnerabilities) => {
    expect(hasConsistentAuditExitStatus({ metadata: { vulnerabilities } }, status)).toBe(false);
  });

  it('fails closed when a severity count is not a non-negative integer', () => {
    const vulnerabilities = { info: 0, low: -1, moderate: 0, high: 0, critical: 0, total: 0 };

    expect(hasConsistentAuditExitStatus({ metadata: { vulnerabilities } }, 0)).toBe(false);
  });

  it('pins npm audit to the low exit threshold and checks status before evaluating findings', () => {
    const helperSource = readFileSync('scripts/security-audit.js', 'utf8');

    expect(helperSource).toContain("['audit', '--json', '--audit-level=low']");
    expect(helperSource).toContain('!isExpectedAuditExitStatus(audit.status)');
    expect(helperSource).toContain('!hasConsistentAuditExitStatus(report, audit.status)');
  });
});
