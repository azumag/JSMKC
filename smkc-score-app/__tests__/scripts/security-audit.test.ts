import { evaluateAuditReport } from '../../scripts/security-audit.js';

const allowedChainReport = {
  vulnerabilities: {
    'deepmerge-ts': {
      severity: 'high',
      via: [
        {
          name: 'deepmerge-ts',
          dependency: 'deepmerge-ts',
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
          range: '<8.0.0',
        },
      ],
      effects: ['@prisma/config'],
    },
    '@prisma/config': {
      severity: 'high',
      via: ['deepmerge-ts'],
      effects: ['prisma'],
    },
    prisma: {
      severity: 'high',
      via: ['@prisma/config'],
      effects: [],
    },
  },
};

const allowedLockfile = {
  packages: {
    '': {
      devDependencies: { prisma: '^6.19.3' },
    },
    'node_modules/deepmerge-ts': {
      version: '7.1.5',
      resolved: 'https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-7.1.5.tgz',
      integrity: 'sha512-HOJkrhaYsweh+W+e74Yn7YStZOilkoPb6fycpwNLKzSPtruFs48nYis0zy5yJz1+ktUhHxoRDJ27RQAWLIJVJw==',
      devOptional: true,
    },
    'node_modules/@prisma/config': {
      version: '6.19.3',
      resolved: 'https://registry.npmjs.org/@prisma/config/-/config-6.19.3.tgz',
      integrity: 'sha512-CBPT44BjlQxEt8kiMEauji2WHTDoVBOKl7UlewXmUgBPnr/oPRZC3psci5chJnYmH0ivEIog2OU9PGWoki3DLQ==',
      devOptional: true,
      dependencies: { 'deepmerge-ts': '7.1.5' },
    },
    'node_modules/prisma': {
      version: '6.19.3',
      resolved: 'https://registry.npmjs.org/prisma/-/prisma-6.19.3.tgz',
      integrity: 'sha512-++ZJ0ijLrDJF6hNB4t4uxg2br3fC4H9Yc9tcbjr2fcNFP3rh/SBNrAgjhsqBU4Ght8JPrVofG/ZkXfnSfnYsFg==',
      devOptional: true,
      dependencies: { '@prisma/config': '6.19.3' },
    },
  },
};

describe('security audit exception', () => {
  it('allows only the known dev-only Prisma deepmerge advisory chain', () => {
    const result = evaluateAuditReport(allowedChainReport, allowedLockfile);

    expect(result.ok).toBe(true);
    expect(result.unexpected).toEqual([]);
    expect(result.allowed).toEqual(['deepmerge-ts', '@prisma/config', 'prisma']);
  });

  it('accepts matching npm audit summary severity metadata', () => {
    const report = {
      ...structuredClone(allowedChainReport),
      metadata: { vulnerabilities: { high: 3, critical: 0 } },
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(true);
    expect(result.unexpected).toEqual([]);
  });

  it.each([1, 4])('fails closed when npm audit summary high count is %i but the graph contains 3', (high) => {
    const report = {
      ...structuredClone(allowedChainReport),
      metadata: { vulnerabilities: { high, critical: 0 } },
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when npm audit summary omits blocking severities present in the graph', () => {
    const report = {
      ...structuredClone(allowedChainReport),
      metadata: { vulnerabilities: { high: 0, critical: 0 } },
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when npm audit summary reports a critical severity absent from the graph', () => {
    const report = {
      ...structuredClone(allowedChainReport),
      metadata: { vulnerabilities: { high: 3, critical: 1 } },
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when another high vulnerability appears', () => {
    const report = {
      vulnerabilities: {
        ...structuredClone(allowedChainReport).vulnerabilities,
        'unexpected-package': {
          severity: 'high',
          via: [{ url: 'https://github.com/advisories/GHSA-other' }],
          effects: [],
        },
      },
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain('unexpected-package');
  });

  it('fails closed cleanly when deepmerge is not the blocking vulnerability', () => {
    const report = {
      vulnerabilities: {
        'unexpected-package': {
          severity: 'high',
          via: [{ url: 'https://github.com/advisories/GHSA-other' }],
          effects: [],
        },
      },
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(['unexpected-package']);
  });

  it('fails closed when the advisory id changes', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via[0].url = 'https://github.com/advisories/GHSA-different';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
  });

  it('fails closed when the advisory URL host changes but the advisory id path stays the same', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via[0].url = 'https://example.invalid/GHSA-ggr8-5vv4-36mx';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it('fails closed when the known advisory affected range changes', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via[0].range = '<=8.0.0';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it('fails closed when the direct advisory package name changes', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via[0].name = 'unexpected-package';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it('fails closed when the direct advisory dependency changes', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via[0].dependency = 'unexpected-package';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it('fails closed when the direct advisory severity metadata changes', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via[0].severity = 'critical';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it('fails closed when the pinned dependency is no longer devOptional 7.1.5', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/deepmerge-ts'].devOptional = false;

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
  });

  it('fails closed when the pinned deepmerge-ts version changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/deepmerge-ts'].version = '7.1.6';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the pinned deepmerge-ts tarball source changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/deepmerge-ts'].resolved = 'https://example.invalid/deepmerge-ts-7.1.5.tgz';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the pinned deepmerge-ts integrity changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/deepmerge-ts'].integrity = 'sha512-different';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the Prisma devDependency range changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages[''].devDependencies.prisma = '^6.20.0';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed Prisma version changes inside the allowed manifest range', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/prisma'].version = '6.20.0';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed Prisma tarball source changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/prisma'].resolved = 'https://example.invalid/prisma-6.19.3.tgz';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed Prisma integrity changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/prisma'].integrity = 'sha512-different';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed @prisma/config version changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/@prisma/config'].version = '6.20.0';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed @prisma/config tarball source changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/@prisma/config'].resolved = 'https://example.invalid/config-6.19.3.tgz';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed @prisma/config integrity changes', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/@prisma/config'].integrity = 'sha512-different';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when Prisma no longer pins the expected @prisma/config version', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/prisma'].dependencies['@prisma/config'] = '6.20.0';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when @prisma/config no longer pins the vulnerable deepmerge-ts version', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/@prisma/config'].dependencies['deepmerge-ts'] = '8.0.1';

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when the installed Prisma chain is no longer devOptional', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/@prisma/config'].devOptional = false;

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when Prisma becomes a production dependency', () => {
    const baseLockfile = structuredClone(allowedLockfile);
    const lockfile = {
      ...baseLockfile,
      packages: {
        ...baseLockfile.packages,
        '': {
          ...baseLockfile.packages[''],
          dependencies: { prisma: '^6.19.3' },
        },
      },
    };

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when npm audit does not return the expected report shape', () => {
    const result = evaluateAuditReport({ error: { code: 'EAUDIT' } }, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when npm audit returns an error alongside an empty vulnerability map', () => {
    const result = evaluateAuditReport({ error: { code: 'ENETWORK' }, vulnerabilities: {} }, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when an allowed-chain package gains another via dependency', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities.prisma.via = ['@prisma/config', 'other-vulnerability'];

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain('prisma');
  });

  it('fails closed when the allowed graph gains another dependent branch', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].effects.push('unexpected-wrapper');
    report.vulnerabilities['unexpected-wrapper'] = {
      severity: 'high',
      via: ['deepmerge-ts'],
      effects: [],
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed when an allowed dependency edge is rewired inside the known package set', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['@prisma/config'].via = ['prisma'];

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });

  it('fails closed if the known advisory severity escalates to critical', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].severity = 'critical';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it('fails closed if the root advisory severity changes below high while downstream entries stay high', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].severity = 'moderate';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
  });
});
