import { inspectPublishedRemediationPackageSet } from '../../scripts/security-audit-next-major.js';

const remediatedStatus = {
  state: 'compatible-forward-remediation-available',
  registry: 'https://registry.npmjs.org/',
  prismaSelector: '^7.0.0',
  latestCompatiblePrismaVersion: '7.11.0',
  prismaConfigSelector: '7.11.0',
  latestCompatiblePrismaConfigVersion: '7.11.0',
  prismaConfigDeepmergeRequirement: '8.0.2',
};

describe('next-major Prisma runtime package evidence validation', () => {
  it('distinguishes invalid client metadata from a registry lookup failure', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@7.11.0') return ['not-semver'];
      throw new Error(`adapter lookup should not run after invalid client evidence: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, npmView)).toEqual({
      state: 'unavailable',
      reason: 'prisma-client-evidence-invalid',
      prismaClientSelector: '7.11.0',
      prismaClientVersion: null,
      prismaAdapterD1Selector: '7.11.0',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(1);
  });

  it('distinguishes invalid adapter metadata from a registry lookup failure', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@7.11.0') return '7.11.0';
      if (selector === '@prisma/adapter-d1@7.11.0') return { unexpected: true };
      throw new Error(`unexpected npm view: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, npmView)).toEqual({
      state: 'unavailable',
      reason: 'adapter-d1-evidence-invalid',
      prismaClientSelector: '7.11.0',
      prismaClientVersion: '7.11.0',
      prismaAdapterD1Selector: '7.11.0',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(2);
  });
});
