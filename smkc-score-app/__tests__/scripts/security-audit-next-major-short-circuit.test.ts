import { inspectPublishedRemediationPackageSet } from '../../scripts/security-audit-next-major.js';

describe('next-major Prisma runtime package-set short circuit', () => {
  const remediatedStatus = {
    state: 'compatible-forward-remediation-available',
    registry: 'https://registry.npmjs.org/',
    prismaSelector: '^7.0.0',
    latestCompatiblePrismaVersion: '7.11.0',
    prismaConfigSelector: '7.11.0',
    latestCompatiblePrismaConfigVersion: '7.11.0',
    prismaConfigDeepmergeRequirement: '8.0.2',
  };

  it('does not query the adapter after the exact client selector resolves to a mismatched version', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      expect(field).toBe('version');
      if (selector === '@prisma/client@7.11.0') return '7.11.1';
      throw new Error(`adapter lookup should not run after client mismatch: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, npmView)).toEqual({
      state: 'incomplete',
      reason: 'runtime-package-version-mismatch',
      prismaClientSelector: '7.11.0',
      prismaClientVersion: '7.11.1',
      prismaAdapterD1Selector: '7.11.0',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(1);
    expect(npmView).toHaveBeenCalledWith('@prisma/client@7.11.0', 'version');
  });
});
