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

  it('accepts object metadata when the vulnerability summary is omitted', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {},
        metadata: { dependencies: { prod: 1, dev: 2, optional: 0, peer: 0, peerOptional: 0, total: 3 } },
      },
      emptyLockfile,
    );

    expect(result.ok).toBe(true);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it.each([null, [], 'metadata', 42])('fails closed when audit metadata is not an object: %p', (metadata) => {
    const result = evaluateAuditReport({ vulnerabilities: {}, metadata }, emptyLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
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

  it('accepts supported graph field shapes for a non-blocking vulnerability', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          package: {
            name: 'package',
            severity: 'moderate',
            isDirect: false,
            range: '<1.0.0',
            via: [
              'dependency',
              {
                name: 'package',
                dependency: 'package',
                severity: 'moderate',
                range: '<1.0.0',
                url: 'https://github.com/advisories/GHSA-example-example-example',
              },
            ],
            effects: ['consumer'],
            nodes: ['node_modules/package'],
          },
        },
      },
      emptyLockfile,
    );

    expect(result.ok).toBe(true);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it.each([null, 'dependency', 42, {}])('fails closed when vulnerability via is not an array: %p', (via) => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity: 'moderate', via, effects: [] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([null, 42, [], true])('fails closed when vulnerability via contains an unsupported entry: %p', (entry) => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity: 'moderate', via: [entry], effects: [] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([
    ['name', 42],
    ['dependency', 42],
    ['severity', 'UNKNOWN'],
    ['range', 42],
    ['url', 42],
  ])('fails closed when direct advisory %s has an invalid value', (field, value) => {
    const advisory = {
      name: 'package',
      dependency: 'package',
      severity: 'moderate',
      range: '<1.0.0',
      url: 'https://github.com/advisories/GHSA-example-example-example',
      [field]: value,
    };
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity: 'moderate', via: [advisory], effects: [] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([
    ['isDirect', 'false'],
    ['range', 42],
  ])('fails closed when vulnerability %s has an invalid type', (field, value) => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          package: {
            severity: 'moderate',
            via: [],
            effects: [],
            [field]: value,
          },
        },
      },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([
    ['effects', 'consumer'],
    ['nodes', 'node_modules/package'],
  ])('fails closed when vulnerability %s is not an array', (field, value) => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity: 'moderate', via: [], [field]: value } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([
    ['effects', 42],
    ['nodes', 42],
  ])('fails closed when vulnerability %s contains a non-string member', (field, value) => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { severity: 'moderate', via: [], [field]: [value] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('accepts a vulnerability name that matches its top-level package key', () => {
    const result = evaluateAuditReport(
      { vulnerabilities: { package: { name: 'package', severity: 'moderate', via: [], effects: [] } } },
      emptyLockfile,
    );

    expect(result.ok).toBe(true);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it.each(['different-package', '', 42])(
    'fails closed when vulnerability name %p contradicts its top-level package key',
    (name) => {
      const result = evaluateAuditReport(
        { vulnerabilities: { package: { name, severity: 'moderate', via: [], effects: [] } } },
        emptyLockfile,
      );

      expect(result.ok).toBe(false);
      expect(result.allowed).toEqual([]);
      expect(result.unexpected).toEqual(['invalid-audit-report']);
    },
  );

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
