import { evaluateAuditReport } from '../../scripts/security-audit.js';

const allowedChainReport = {
  vulnerabilities: {
    'deepmerge-ts': {
      name: 'deepmerge-ts',
      severity: 'high',
      isDirect: false,
      via: [
        {
          source: 1145093,
          name: 'deepmerge-ts',
          dependency: 'deepmerge-ts',
          title: 'DeepmergeTS has stack exhaustion when merging recursive object graphs',
          severity: 'high',
          cwe: ['CWE-674'],
          cvss: { score: 0, vectorString: null },
          url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
          range: '<8.0.0',
        },
      ],
      effects: ['@prisma/config'],
      range: '<8.0.0',
      nodes: ['node_modules/deepmerge-ts'],
      fixAvailable: { name: 'prisma', version: '6.12.0', isSemVerMajor: true },
    },
    '@prisma/config': {
      name: '@prisma/config',
      severity: 'high',
      isDirect: false,
      via: ['deepmerge-ts'],
      effects: ['prisma'],
      range: '6.13.0-dev.1 - 8.1.0-dev.4',
      nodes: ['node_modules/@prisma/config'],
      fixAvailable: { name: 'prisma', version: '6.12.0', isSemVerMajor: true },
    },
    prisma: {
      name: 'prisma',
      severity: 'high',
      isDirect: true,
      via: ['@prisma/config'],
      effects: [],
      range: '6.13.0-dev.1 - 8.1.0-dev.4',
      nodes: ['node_modules/prisma'],
      fixAvailable: { name: 'prisma', version: '6.12.0', isSemVerMajor: true },
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

function reportWithFixAvailability(fixAvailable: unknown) {
  const report = structuredClone(allowedChainReport);
  Object.assign(report.vulnerabilities['deepmerge-ts'], { fixAvailable });
  return report;
}

describe('security audit remediation availability', () => {
  it.each(['deepmerge-ts', '@prisma/config', 'prisma'])(
    'fails closed when allowed-chain %s no longer reports the pinned remediation target',
    (name) => {
      const report = structuredClone(allowedChainReport);
      report.vulnerabilities[name].fixAvailable = false;

      const result = evaluateAuditReport(report, allowedLockfile);

      expect(result.ok).toBe(false);
      expect(result.allowed).toEqual([]);
      expect(result.unexpected).toEqual(['deepmerge-ts', '@prisma/config', 'prisma']);
    },
  );

  it.each(['deepmerge-ts', '@prisma/config', 'prisma'])(
    'fails closed when allowed-chain %s omits fixAvailable metadata',
    (name) => {
      const report = structuredClone(allowedChainReport);
      delete report.vulnerabilities[name].fixAvailable;

      const result = evaluateAuditReport(report, allowedLockfile);

      expect(result.ok).toBe(false);
      expect(result.allowed).toEqual([]);
      expect(result.unexpected).toEqual(['deepmerge-ts', '@prisma/config', 'prisma']);
    },
  );

  it('keeps the temporary exception when the only remediation is semver-major', () => {
    const report = reportWithFixAvailability({ name: 'prisma', version: '6.12.0', isSemVerMajor: true });

    expect(evaluateAuditReport(report, allowedLockfile).ok).toBe(true);
  });

  it.each([
    { name: 'prisma', version: '7.10.0', isSemVerMajor: true },
    { name: '@prisma/config', version: '6.12.0', isSemVerMajor: true },
  ])('fails closed when the semver-major remediation target drifts: %p', (fixAvailable) => {
    const result = evaluateAuditReport(reportWithFixAvailability(fixAvailable), allowedLockfile);

    expect(result.ok).toBe(false);
    expect(result.allowed).toEqual([]);
    expect(result.unexpected).toContain('deepmerge-ts');
  });

  it.each([true, { name: 'prisma', version: '6.20.0', isSemVerMajor: false }])(
    'fails closed when npm exposes a non-breaking remediation: %p',
    (fixAvailable) => {
      const result = evaluateAuditReport(reportWithFixAvailability(fixAvailable), allowedLockfile);

      expect(result.ok).toBe(false);
      expect(result.allowed).toEqual([]);
      expect(result.unexpected).toContain('deepmerge-ts');
    },
  );

  it.each([
    null,
    [],
    'prisma@6.20.0',
    { name: 'prisma', version: '6.20.0' },
    { name: '', version: '6.20.0', isSemVerMajor: true },
    { name: 'prisma', version: '6.12.0', isSemVerMajor: true, requiresForce: true },
  ])('rejects malformed fixAvailable metadata as an invalid audit report: %p', (fixAvailable) => {
    const result = evaluateAuditReport(reportWithFixAvailability(fixAvailable), allowedLockfile);

    expect(result).toEqual({ ok: false, allowed: [], unexpected: ['invalid-audit-report'] });
  });
});
