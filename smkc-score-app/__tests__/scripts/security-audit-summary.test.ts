import { evaluateAuditReport } from '../../scripts/security-audit.js';

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

function mixedSeverityReport() {
  return {
    vulnerabilities: {
      'deepmerge-ts': {
        name: 'deepmerge-ts',
        severity: 'high',
        isDirect: false,
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
        range: '<8.0.0',
        nodes: ['node_modules/deepmerge-ts'],
      },
      '@prisma/config': {
        name: '@prisma/config',
        severity: 'high',
        isDirect: false,
        via: ['deepmerge-ts'],
        effects: ['prisma'],
        range: '6.13.0-dev.1 - 8.1.0-dev.4',
        nodes: ['node_modules/@prisma/config'],
      },
      prisma: {
        name: 'prisma',
        severity: 'high',
        isDirect: true,
        via: ['@prisma/config'],
        effects: [],
        range: '6.13.0-dev.1 - 8.1.0-dev.4',
        nodes: ['node_modules/prisma'],
      },
      'moderate-only-package': {
        severity: 'moderate',
        via: [],
        effects: [],
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 1,
        high: 3,
        critical: 0,
        total: 4,
      },
    },
  };
}

describe('npm audit vulnerability summary consistency', () => {
  it('accepts a summary whose severity counts and total match the vulnerability graph', () => {
    const result = evaluateAuditReport(mixedSeverityReport(), allowedLockfile);

    expect(result.ok).toBe(true);
    expect(result.unexpected).toEqual([]);
    expect(result.allowed).toEqual(['deepmerge-ts', '@prisma/config', 'prisma']);
  });

  it('fails closed when a non-blocking severity count disagrees with the graph', () => {
    const report = mixedSeverityReport();
    report.metadata.vulnerabilities.moderate = 0;

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when a non-blocking severity count is malformed', () => {
    const report = mixedSeverityReport();
    report.metadata.vulnerabilities.low = -1;

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when summary total disagrees with the graph entry count', () => {
    const report = mixedSeverityReport();
    report.metadata.vulnerabilities.total = 3;

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });

  it('fails closed when the summary contains an unknown key', () => {
    const report = mixedSeverityReport();
    Object.assign(report.metadata.vulnerabilities, { futureSeverity: 0 });

    const result = evaluateAuditReport(report, allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toEqual(['invalid-audit-report']);
  });
});
