import { inspectPublishedRemediationPackageSet } from '../../scripts/security-audit-upstream.js';

const manifest = {
  dependencies: {
    '@prisma/client': '^6.19.3',
    '@prisma/adapter-d1': '^7.8.0',
  },
};

const remediatedStatus = {
  state: 'compatible-forward-remediation-available',
  registry: 'https://registry.npmjs.org/',
  prismaSelector: '^6.19.3',
  latestCompatiblePrismaVersion: '6.20.0',
  prismaConfigSelector: '6.20.0',
  latestCompatiblePrismaConfigVersion: '6.20.0',
  prismaConfigDeepmergeRequirement: '8.0.2',
};

describe('compatible Prisma runtime package evidence validation', () => {
  it('distinguishes invalid client metadata from a registry lookup failure', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return ['not-semver'];
      throw new Error(`adapter lookup should not run after invalid client evidence: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, manifest, npmView)).toEqual({
      state: 'unavailable',
      reason: 'prisma-client-evidence-invalid',
      prismaClientSelector: '^6.19.3',
      prismaClientVersion: null,
      prismaAdapterD1Selector: '^7.8.0',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(1);
  });

  it('distinguishes invalid adapter metadata from a registry lookup failure', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return ['6.19.3', '6.20.0'];
      if (selector === '@prisma/adapter-d1@^7.8.0') return { unexpected: true };
      throw new Error(`unexpected npm view: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, manifest, npmView)).toEqual({
      state: 'unavailable',
      reason: 'adapter-d1-evidence-invalid',
      prismaClientSelector: '^6.19.3',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Selector: '^7.8.0',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(2);
  });
});
