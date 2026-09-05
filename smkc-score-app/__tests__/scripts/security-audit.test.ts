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
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['unexpected-package'] = {
      severity: 'high',
      via: [{ url: 'https://github.com/advisories/GHSA-other' }],
      effects: [],
    };

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain('unexpected-package');
  });

  it('fails closed when the advisory id changes', () => {
    const report = structuredClone(allowedChainReport);
    report.vulnerabilities['deepmerge-ts'].via = [
      { url: 'https://github.com/advisories/GHSA-different' },
    ];

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
  });

  it('fails closed when the pinned dependency is no longer devOptional 7.1.5', () => {
    const lockfile = structuredClone(allowedLockfile);
    lockfile.packages['node_modules/deepmerge-ts'].devOptional = false;

    const result = evaluateAuditReport(allowedChainReport, lockfile);

    expect(result.ok).toBe(false);
  });
});
