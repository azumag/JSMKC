import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CANONICAL_NPM_REGISTRY,
  enrichCompatiblePrismaReleaseWithPublishedPackageSet,
  formatCompatiblePrismaReleaseStatus,
  getPublishedRemediationCandidate,
  getRuntimePackageVersionSelector,
  inspectPublishedRemediationPackageSet,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream.js';

describe('compatible Prisma remediation package set', () => {
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

  it('does not query runtime packages while the compatible release is still vulnerable', () => {
    const npmView = jest.fn();

    expect(inspectPublishedRemediationPackageSet(vulnerableStatus, manifest, npmView)).toEqual({
      state: 'not-applicable',
      reason: 'upstream-remediation-not-applicable',
      prismaClientSelector: null,
      prismaClientVersion: null,
      prismaAdapterD1Selector: null,
      prismaAdapterD1Version: null,
    });
    expect(npmView).not.toHaveBeenCalled();
  });

  it('uses each declared runtime selector instead of forcing the adapter to the CLI major', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      expect(field).toBe('version');
      if (selector === '@prisma/client@^6.19.3') return ['6.19.3', '6.20.0'];
      if (selector === '@prisma/adapter-d1@^7.8.0') return ['7.8.0', '7.10.0'];
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    const status = enrichCompatiblePrismaReleaseWithPublishedPackageSet(remediatedStatus, manifest, npmView);

    expect(status.publishedRemediationPackageSet).toEqual({
      state: 'ready',
      reason: 'published-package-set-ready',
      prismaClientSelector: '^6.19.3',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Selector: '^7.8.0',
      prismaAdapterD1Version: '7.10.0',
    });
    expect(getPublishedRemediationCandidate(status)).toBe('6.20.0');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('published remediation candidate: 6.20.0');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain(
      'published remediation package set reason: published-package-set-ready',
    );
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('manifest @prisma/client selector: ^6.19.3');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('manifest-compatible @prisma/client: 6.20.0');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('manifest @prisma/adapter-d1 selector: ^7.8.0');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('manifest-compatible @prisma/adapter-d1: 7.10.0');
  });

  it('keeps a remediation candidate ready when a newer manifest-compatible client is also published', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return ['6.19.3', '6.20.0', '6.21.0'];
      if (selector === '@prisma/adapter-d1@^7.8.0') return ['7.8.0', '7.10.0'];
      throw new Error(`unexpected npm view: ${selector}`);
    });

    const status = enrichCompatiblePrismaReleaseWithPublishedPackageSet(remediatedStatus, manifest, npmView);

    expect(status.publishedRemediationPackageSet).toEqual({
      state: 'ready',
      reason: 'published-package-set-ready',
      prismaClientSelector: '^6.19.3',
      prismaClientVersion: '6.21.0',
      prismaAdapterD1Selector: '^7.8.0',
      prismaAdapterD1Version: '7.10.0',
    });
    expect(getPublishedRemediationCandidate(status)).toBe('6.20.0');
  });

  it('withholds the candidate when a runtime package cannot be confirmed', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return '6.20.0';
      throw new Error('package version unavailable');
    });

    const status = enrichCompatiblePrismaReleaseWithPublishedPackageSet(remediatedStatus, manifest, npmView);

    expect(status.publishedRemediationPackageSet).toEqual({
      state: 'unavailable',
      reason: 'adapter-d1-registry-unavailable',
      prismaClientSelector: '^6.19.3',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Selector: '^7.8.0',
      prismaAdapterD1Version: null,
    });
    expect(getPublishedRemediationCandidate(status)).toBeNull();
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('published remediation candidate: none');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('manifest @prisma/adapter-d1 selector: ^7.8.0');
  });

  it('short-circuits adapter lookup when the manifest-compatible client does not include the CLI candidate', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@^6.19.3') return '6.19.4';
      throw new Error(`adapter lookup should not run after missing client candidate: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, manifest, npmView)).toEqual({
      state: 'incomplete',
      reason: 'prisma-client-candidate-missing',
      prismaClientSelector: '^6.19.3',
      prismaClientVersion: '6.19.4',
      prismaAdapterD1Selector: '^7.8.0',
      prismaAdapterD1Version: null,
    });
    expect(npmView).toHaveBeenCalledTimes(1);
    expect(npmView).toHaveBeenCalledWith('@prisma/client@^6.19.3', 'version');
  });

  it('rejects non-registry runtime selectors instead of treating them as package evidence', () => {
    expect(() =>
      getRuntimePackageVersionSelector(
        {
          dependencies: {
            '@prisma/adapter-d1': 'workspace:*',
          },
        },
        '@prisma/adapter-d1',
      ),
    ).toThrow('package.json dependencies.@prisma/adapter-d1 must be a registry SemVer selector');
  });

  it('publishes package-set evidence as safe single-line GitHub outputs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-audit-compatible-package-set-'));
    const outputPath = path.join(directory, 'github-output.txt');

    try {
      writeGitHubOutputs(
        {
          ...remediatedStatus,
          publishedRemediationPackageSet: {
            state: 'ready',
            reason: 'published-package-set-ready',
            prismaClientSelector: '^6.19.3',
            prismaClientVersion: '6.20.0',
            prismaAdapterD1Selector: '^7.8.0',
            prismaAdapterD1Version: '7.10.0',
          },
        },
        outputPath,
      );

      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).toContain('published_remediation_candidate=6.20.0\n');
      expect(output).toContain('published_remediation_package_set_state=ready\n');
      expect(output).toContain('published_remediation_package_set_reason=published-package-set-ready\n');
      expect(output).toContain('published_remediation_prisma_client_selector=^6.19.3\n');
      expect(output).toContain('published_remediation_prisma_client_version=6.20.0\n');
      expect(output).toContain('published_remediation_adapter_d1_selector=^7.8.0\n');
      expect(output).toContain('published_remediation_adapter_d1_version=7.10.0\n');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
