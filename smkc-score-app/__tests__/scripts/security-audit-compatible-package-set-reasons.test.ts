import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CANONICAL_NPM_REGISTRY,
  formatCompatiblePrismaReleaseStatus,
  inspectPublishedRemediationPackageSet,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream.js';

describe('compatible Prisma remediation package-set reasons', () => {
  const manifest = {
    dependencies: {
      '@prisma/client': '^6.19.3',
      '@prisma/adapter-d1': '^7.8.0',
    },
  };

  const vulnerableStatus = {
    state: 'compatible-release-still-vulnerable',
    registry: CANONICAL_NPM_REGISTRY,
    prismaSelector: '^6.19.3',
    latestCompatiblePrismaVersion: '6.19.3',
    prismaConfigSelector: '6.19.3',
    latestCompatiblePrismaConfigVersion: '6.19.3',
    prismaConfigDeepmergeRequirement: '7.1.5',
  };

  const remediatedStatus = {
    ...vulnerableStatus,
    state: 'compatible-forward-remediation-available',
    latestCompatiblePrismaVersion: '6.20.0',
    prismaConfigSelector: '6.20.0',
    latestCompatiblePrismaConfigVersion: '6.20.0',
    prismaConfigDeepmergeRequirement: '8.0.2',
  };

  it('distinguishes not-applicable and ready evidence', () => {
    expect(inspectPublishedRemediationPackageSet(vulnerableStatus, manifest, jest.fn())).toMatchObject({
      state: 'not-applicable',
      reason: 'upstream-remediation-not-applicable',
    });

    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return ['6.19.3', '6.20.0'];
      if (selector === '@prisma/adapter-d1@^7.8.0') return ['7.8.0', '7.10.0'];
      throw new Error(`unexpected npm view: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, manifest, npmView)).toMatchObject({
      state: 'ready',
      reason: 'published-package-set-ready',
    });
  });

  it('distinguishes client and adapter registry failures', () => {
    const clientUnavailable = jest.fn(() => {
      throw new Error('client registry unavailable');
    });
    expect(inspectPublishedRemediationPackageSet(remediatedStatus, manifest, clientUnavailable)).toMatchObject({
      state: 'unavailable',
      reason: 'prisma-client-registry-unavailable',
      prismaClientVersion: null,
      prismaAdapterD1Version: null,
    });

    const adapterUnavailable = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return ['6.19.3', '6.20.0'];
      throw new Error('adapter registry unavailable');
    });
    expect(inspectPublishedRemediationPackageSet(remediatedStatus, manifest, adapterUnavailable)).toMatchObject({
      state: 'unavailable',
      reason: 'adapter-d1-registry-unavailable',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Version: null,
    });
  });

  it('reports the missing client candidate before querying adapter evidence', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return ['6.19.3', '6.19.4'];
      throw new Error(`adapter lookup should not run after missing client candidate: ${selector}`);
    });

    const packageSet = inspectPublishedRemediationPackageSet(remediatedStatus, manifest, npmView);
    expect(packageSet).toMatchObject({
      state: 'incomplete',
      reason: 'prisma-client-candidate-missing',
      prismaClientVersion: '6.19.4',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(1);

    const text = formatCompatiblePrismaReleaseStatus({
      ...remediatedStatus,
      publishedRemediationPackageSet: packageSet,
    });
    expect(text).toContain('published remediation package set reason: prisma-client-candidate-missing');
    expect(text).toContain('manifest-compatible @prisma/adapter-d1: none');
  });

  it('publishes the reason as a safe GitHub Actions output', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-audit-package-set-reason-'));
    const outputPath = path.join(directory, 'github-output.txt');

    try {
      writeGitHubOutputs(
        {
          ...remediatedStatus,
          publishedRemediationPackageSet: {
            state: 'unavailable',
            reason: 'adapter-d1-registry-unavailable',
            prismaClientSelector: '^6.19.3',
            prismaClientVersion: '6.20.0',
            prismaAdapterD1Selector: '^7.8.0',
            prismaAdapterD1Version: null,
          },
        },
        outputPath,
      );

      expect(fs.readFileSync(outputPath, 'utf8')).toContain(
        'published_remediation_package_set_reason=adapter-d1-registry-unavailable\n',
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
