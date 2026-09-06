import { evaluateAuditReport } from '../../scripts/security-audit.js';

describe('security audit error report handling', () => {
  const emptyLockfile = { packages: {} };

  it('accepts a canonical empty report when no error marker is present', () => {
    expect(evaluateAuditReport({ vulnerabilities: {} }, emptyLockfile)).toEqual({
      ok: true,
      allowed: [],
      unexpected: [],
    });
  });

  it.each([null, false, 0, '', { message: 'registry unavailable' }])(
    'fails closed whenever npm audit includes an explicit error field: %p',
    (error) => {
      expect(evaluateAuditReport({ vulnerabilities: {}, error }, emptyLockfile)).toEqual({
        ok: false,
        allowed: [],
        unexpected: ['invalid-audit-report'],
      });
    },
  );
});
