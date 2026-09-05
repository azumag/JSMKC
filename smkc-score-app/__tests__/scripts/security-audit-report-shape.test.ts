import { evaluateAuditReport } from '../../scripts/security-audit.js';

describe('security audit report shape', () => {
  const emptyLockfile = { packages: {} };

  it('accepts the canonical empty vulnerability map', () => {
    expect(evaluateAuditReport({ vulnerabilities: {} }, emptyLockfile)).toEqual({
      ok: true,
      allowed: [],
      unexpected: [],
    });
  });

  it('fails closed when vulnerabilities is an array', () => {
    const result = evaluateAuditReport({ vulnerabilities: [] }, emptyLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([null, [], 'high'])('fails closed when a vulnerability node is not an object: %p', (vulnerability) => {
    const result = evaluateAuditReport({ vulnerabilities: { package: vulnerability } }, emptyLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each(['unknown', 'HIGH', ''])('fails closed when a vulnerability has an unknown severity: %p', (severity) => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity, via: [], effects: [] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each(['info', 'low', 'moderate'])('accepts supported non-blocking severity %s', (severity) => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity, via: [], effects: [] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(true);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });
});
