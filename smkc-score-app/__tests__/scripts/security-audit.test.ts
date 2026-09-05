import { evaluateAuditReport } from '../../scripts/security-audit.js';

const allowedChainReport = {
  vulnerabilities: {
    'deepmerge-ts': {
      severity: 'high',
      via: [
        {
          url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
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
      devOptional: true,
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
    report.vulnerabilities['deepmerge-ts'].via = [{ url: 'https://github.com/advisories/GHSA-different' }];

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
  });

  it('fails closed when the pinned dependency is no longer devOptional 7.1.5', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/deepmerge-ts'].devOptional = false;

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
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

  it('fails closed if the known advisory severity escalates to critical', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].severity = 'critical';

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain('deepmerge-ts');
  });
});
