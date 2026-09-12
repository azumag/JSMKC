import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CANONICAL_NPM_REGISTRY,
  enrichCompatiblePrismaReleaseWithPublishedPackageSet,
  formatCompatiblePrismaReleaseStatus,
  getPublishedRemediationCandidate,
  inspectPublishedRemediationPackageSet,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream.js';

describe('compatible Prisma remediation package set', () => {
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

  it('does not query companion packages while the compatible release is still vulnerable', () => {
    const npmView = jest.fn();

    expect(inspectPublishedRemediationPackageSet(vulnerableStatus, npmView)).toEqual({
      state: 'not-applicable',
      prismaClientVersion: null,
      prismaAdapterD1Version: null,
    });
    expect(npmView).not.toHaveBeenCalled();
  });

  it('only exposes a remediation candidate when the same-version client and D1 adapter are published', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      expect(field).toBe('version');
      if (selector === '@prisma/client@6.20.0') return '6.20.0';
      if (selector === '@prisma/adapter-d1@6.20.0') return '6.20.0';
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    const status = enrichCompatiblePrismaReleaseWithPublishedPackageSet(remediatedStatus, npmView);

    expect(status.publishedRemediationPackageSet).toEqual({
      state: 'ready',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Version: '6.20.0',
    });
    expect(getPublishedRemediationCandidate(status)).toBe('6.20.0');
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('published remediation candidate: 6.20.0');
  });

  it('withholds the candidate when a companion package cannot be confirmed', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@6.20.0') return '6.20.0';
      throw new Error('package version unavailable');
    });

    const status = enrichCompatiblePrismaReleaseWithPublishedPackageSet(remediatedStatus, npmView);

    expect(status.publishedRemediationPackageSet).toEqual({
      state: 'unavailable',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Version: null,
    });
    expect(getPublishedRemediationCandidate(status)).toBeNull();
    expect(formatCompatiblePrismaReleaseStatus(status)).toContain('published remediation candidate: none');
  });

  it('marks mismatched companion package versions as incomplete', () => {
    const npmView = jest.fn((selector: string) => {
      if (selector === '@prisma/client@6.20.0') return '6.20.0';
      if (selector === '@prisma/adapter-d1@6.20.0') return '6.19.4';
      throw new Error(`unexpected npm view: ${selector}`);
    });

    expect(inspectPublishedRemediationPackageSet(remediatedStatus, npmView)).toEqual({
      state: 'incomplete',
      prismaClientVersion: '6.20.0',
      prismaAdapterD1Version: '6.19.4',
    });
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
            prismaClientVersion: '6.20.0',
            prismaAdapterD1Version: '6.20.0',
          },
        },
        outputPath,
      );

      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).toContain('published_remediation_candidate=6.20.0\n');
      expect(output).toContain('published_remediation_package_set_state=ready\n');
      expect(output).toContain('published_remediation_prisma_client_version=6.20.0\n');
      expect(output).toContain('published_remediation_adapter_d1_version=6.20.0\n');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
