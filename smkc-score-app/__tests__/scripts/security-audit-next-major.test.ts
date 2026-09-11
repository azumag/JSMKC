import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  formatNextMajorPrismaReleaseStatus,
  getNextMajorPrismaSelector,
  getPublishedRemediationCandidate,
  inspectNextMajorPrismaRelease,
  writeNextMajorGitHubOutputs,
} from '../../scripts/security-audit-next-major.js';

describe('next-major Prisma upstream probe', () => {
  const manifest = {
    devDependencies: {
      prisma: '^6.19.3',
    },
  };

  it('derives the next major from the current caret selector', () => {
    expect(getNextMajorPrismaSelector(manifest)).toBe('^7.0.0');
  });

  it('fails closed when the current Prisma selector is not a caret range', () => {
    expect(() => getNextMajorPrismaSelector({ devDependencies: { prisma: '~6.19.3' } })).toThrow(
      'must use a caret SemVer selector',
    );
    expect(() => getNextMajorPrismaSelector({ devDependencies: { prisma: '6.19.3' } })).toThrow(
      'must use a caret SemVer selector',
    );
  });

  it('reports a published candidate when the next major contains a patched upstream dependency edge', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      if (selector === 'prisma@^7.0.0' && field === 'version') {
        return ['7.9.1', '7.10.0', '7.11.0'];
      }
      if (selector === 'prisma@7.11.0' && field === 'dependencies') {
        return { '@prisma/config': '7.11.0' };
      }
      if (selector === '@prisma/config@7.11.0' && field === 'version') {
        return '7.11.0';
      }
      if (selector === '@prisma/config@7.11.0' && field === 'dependencies') {
        return { 'deepmerge-ts': '8.0.2' };
      }
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    const status = inspectNextMajorPrismaRelease({ manifest, npmView });
    expect(status).toEqual({
      state: 'compatible-forward-remediation-available',
      registry: 'https://registry.npmjs.org/',
      currentPrismaSelector: '^6.19.3',
      prismaSelector: '^7.0.0',
      latestCompatiblePrismaVersion: '7.11.0',
      prismaConfigSelector: '7.11.0',
      latestCompatiblePrismaConfigVersion: '7.11.0',
      prismaConfigDeepmergeRequirement: '8.0.2',
    });
    expect(getPublishedRemediationCandidate(status)).toBe('7.11.0');
  });

  it('keeps next-major evidence distinct when the latest published next major is still vulnerable', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      if (selector === 'prisma@^7.0.0' && field === 'version') {
        return ['7.9.1', '7.10.0'];
      }
      if (selector === 'prisma@7.10.0' && field === 'dependencies') {
        return { '@prisma/config': '7.10.0' };
      }
      if (selector === '@prisma/config@7.10.0' && field === 'version') {
        return '7.10.0';
      }
      if (selector === '@prisma/config@7.10.0' && field === 'dependencies') {
        return { 'deepmerge-ts': '7.1.5' };
      }
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    const status = inspectNextMajorPrismaRelease({ manifest, npmView });
    expect(status.state).toBe('compatible-release-still-vulnerable');
    expect(status.currentPrismaSelector).toBe('^6.19.3');
    expect(status.prismaSelector).toBe('^7.0.0');
    expect(getPublishedRemediationCandidate(status)).toBeNull();
  });

  it('formats next-major evidence without implying that an unpublished branch fix is available to install', () => {
    const text = formatNextMajorPrismaReleaseStatus({
      state: 'compatible-release-still-vulnerable',
      registry: 'https://registry.npmjs.org/',
      currentPrismaSelector: '^6.19.3',
      prismaSelector: '^7.0.0',
      latestCompatiblePrismaVersion: '7.10.0',
      prismaConfigSelector: '7.10.0',
      latestCompatiblePrismaConfigVersion: '7.10.0',
      prismaConfigDeepmergeRequirement: '7.1.5',
    });

    expect(text).toContain('current manifest prisma selector: ^6.19.3');
    expect(text).toContain('next-major prisma selector: ^7.0.0');
    expect(text).toContain('latest next-major prisma: 7.10.0');
    expect(text).toContain('published remediation candidate: none');
    expect(text).not.toContain('updated package.json');
  });

  it('formats the exact stable Prisma version when a published remediation candidate exists', () => {
    const text = formatNextMajorPrismaReleaseStatus({
      state: 'compatible-forward-remediation-available',
      registry: 'https://registry.npmjs.org/',
      currentPrismaSelector: '^6.19.3',
      prismaSelector: '^7.0.0',
      latestCompatiblePrismaVersion: '7.11.0',
      prismaConfigSelector: '7.11.0',
      latestCompatiblePrismaConfigVersion: '7.11.0',
      prismaConfigDeepmergeRequirement: '8.0.2',
    });

    expect(text).toContain('published remediation candidate: 7.11.0');
  });

  it('publishes the current selector and installable remediation candidate as separate workflow outputs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-audit-next-major-'));
    const outputPath = path.join(directory, 'github-output.txt');

    try {
      writeNextMajorGitHubOutputs(
        {
          state: 'compatible-forward-remediation-available',
          registry: 'https://registry.npmjs.org/',
          currentPrismaSelector: '^6.19.3',
          prismaSelector: '^7.0.0',
          latestCompatiblePrismaVersion: '7.11.0',
          prismaConfigSelector: '7.11.0',
          latestCompatiblePrismaConfigVersion: '7.11.0',
          prismaConfigDeepmergeRequirement: '8.0.2',
        },
        outputPath,
      );

      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).toContain('current_prisma_selector=^6.19.3\n');
      expect(output).toContain('prisma_selector=^7.0.0\n');
      expect(output).toContain('state=compatible-forward-remediation-available\n');
      expect(output).toContain('prisma_config_deepmerge_requirement=8.0.2\n');
      expect(output).toContain('published_remediation_candidate=7.11.0\n');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('publishes none when the latest stable next major is still vulnerable', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-audit-next-major-'));
    const outputPath = path.join(directory, 'github-output.txt');

    try {
      writeNextMajorGitHubOutputs(
        {
          state: 'compatible-release-still-vulnerable',
          registry: 'https://registry.npmjs.org/',
          currentPrismaSelector: '^6.19.3',
          prismaSelector: '^7.0.0',
          latestCompatiblePrismaVersion: '7.10.0',
          prismaConfigSelector: '7.10.0',
          latestCompatiblePrismaConfigVersion: '7.10.0',
          prismaConfigDeepmergeRequirement: '7.1.5',
        },
        outputPath,
      );

      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).toContain('published_remediation_candidate=none\n');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects unsafe current selectors before writing workflow outputs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-audit-next-major-'));
    const outputPath = path.join(directory, 'github-output.txt');

    try {
      expect(() =>
        writeNextMajorGitHubOutputs(
          {
            state: 'compatible-forward-remediation-available',
            registry: 'https://registry.npmjs.org/',
            currentPrismaSelector: '^6.19.3\nmalformed',
            prismaSelector: '^7.0.0',
            latestCompatiblePrismaVersion: '7.11.0',
            prismaConfigSelector: '7.11.0',
            latestCompatiblePrismaConfigVersion: '7.11.0',
            prismaConfigDeepmergeRequirement: '8.0.2',
          },
          outputPath,
        ),
      ).toThrow('current_prisma_selector');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
