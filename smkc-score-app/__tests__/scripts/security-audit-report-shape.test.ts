import {
  evaluateAuditReport,
  hasConsistentAuditDependencyTotal,
  hasExpectedAuditDependencySummary,
  hasExpectedAuditReportVersion,
  hasExpectedAuditSummary,
} from '../../scripts/security-audit.js';

describe('security audit report shape', () => {
  const emptyLockfile = { packages: {} };

  it('accepts the canonical empty vulnerability map', () => {
    expect(evaluateAuditReport({ vulnerabilities: {} }, emptyLockfile)).toEqual({
      ok: true,
      allowed: [],
      unexpected: [],
    });
  });

  it('fails closed when a successful npm audit report gains an unknown top-level field', () => {
    const result = evaluateAuditReport(
      { auditReportVersion: 2, vulnerabilities: {}, metadata: {}, futureField: true },
      emptyLockfile,
    );

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('accepts the current npm audit report version', () => {
    expect(evaluateAuditReport({ auditReportVersion: 2, vulnerabilities: {} }, emptyLockfile)).toEqual({
      ok: true,
      allowed: [],
      unexpected: [],
    });
  });

  it('requires auditReportVersion 2 on the real CI entrypoint', () => {
    expect(hasExpectedAuditReportVersion({ auditReportVersion: 2 }, { required: true })).toBe(true);
    for (const auditReportVersion of [undefined, 1, 3, '2', null]) {
      expect(hasExpectedAuditReportVersion({ auditReportVersion }, { required: true })).toBe(false);
    }
  });

  it.each([1, 3, '2', null])('fails closed when npm audit report version drifts: %p', (auditReportVersion) => {
    const result = evaluateAuditReport({ auditReportVersion, vulnerabilities: {} }, emptyLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('requires the complete vulnerability summary on the real CI entrypoint', () => {
    const summary = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
    expect(hasExpectedAuditSummary({ metadata: { vulnerabilities: summary } }, { required: true })).toBe(true);

    for (const report of [
      {},
      { metadata: {} },
      { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } },
      { metadata: { vulnerabilities: null } },
    ]) {
      expect(hasExpectedAuditSummary(report, { required: true })).toBe(false);
    }
  });

  it('requires the complete dependency summary on the real CI entrypoint', () => {
    const dependencies = { prod: 528, dev: 606, optional: 177, peer: 0, peerOptional: 0, total: 1257 };
    expect(hasExpectedAuditDependencySummary({ metadata: { dependencies } }, { required: true })).toBe(true);

    for (const report of [
      {},
      { metadata: {} },
      { metadata: { dependencies: { prod: 528, dev: 606, optional: 177, peer: 0, peerOptional: 0 } } },
      { metadata: { dependencies: null } },
      { metadata: { dependencies: { ...dependencies, total: '1257' } } },
      { metadata: { dependencies: { ...dependencies, workspace: 1 } } },
    ]) {
      expect(hasExpectedAuditDependencySummary(report, { required: true })).toBe(false);
    }
  });

  it('requires audit dependency total to match the installed lockfile package count', () => {
    const dependencies = { prod: 2, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 2 };
    const report = { metadata: { dependencies } };
    const lockfile = { packages: { '': {}, 'node_modules/a': {}, 'node_modules/b': {} } };

    expect(hasConsistentAuditDependencyTotal(report, lockfile, { required: true })).toBe(true);
    expect(
      hasConsistentAuditDependencyTotal({ metadata: { dependencies: { ...dependencies, total: 1 } } }, lockfile, {
        required: true,
      }),
    ).toBe(false);
    expect(hasConsistentAuditDependencyTotal({}, lockfile, { required: true })).toBe(false);
    expect(hasConsistentAuditDependencyTotal(report, { packages: [] }, { required: true })).toBe(false);
  });

  it('keeps dependency-total consistency optional for synthetic evaluator inputs', () => {
    const report = { metadata: { dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 } } };

    expect(hasConsistentAuditDependencyTotal(report, { packages: { '': {} } })).toBe(true);
    expect(hasConsistentAuditDependencyTotal({}, emptyLockfile)).toBe(true);
  });

  it('fails closed when audit metadata gains an unknown field', () => {
    const result = evaluateAuditReport({ vulnerabilities: {}, metadata: { futureMetadata: true } }, emptyLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it.each([
    null,
    [],
    'dependencies',
    { prod: 1, dev: 2, optional: 0, peer: 0, peerOptional: 0, total: -1 },
    { prod: 1, dev: 2, optional: 0, peer: 0, peerOptional: 0, total: 3, workspace: 0 },
  ])('fails closed when audit dependency summary is invalid: %p', (dependencies) => {
    const result = evaluateAuditReport({ vulnerabilities: {}, metadata: { dependencies } }, emptyLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
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

  it('fails closed when a vulnerability entry gains an unknown field', () => {
    const result = evaluateAuditReport(
      {
        vulnerabilities: {
          package: { severity: 'moderate', via: [], effects: [], unknownField: true },
        },
      },
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
                source: 1234567,
                name: 'package',
                dependency: 'package',
                title: 'Example advisory',
                severity: 'moderate',
                cwe: ['CWE-400'],
                cvss: { score: 5.3, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L' },
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
    ['source', 0],
    ['source', '1234567'],
    ['title', ''],
    ['cwe', 'CWE-400'],
    ['cwe', ['']],
    ['cvss', { score: Number.NaN, vectorString: null }],
    ['cvss', { score: 11, vectorString: null }],
    ['cvss', { score: 5, vectorString: 42 }],
    ['cvss', { score: 5, vectorString: null, extra: true }],
    ['unknownField', true],
  ])('fails closed when direct advisory risk metadata %s is invalid: %p', (field, value) => {
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
