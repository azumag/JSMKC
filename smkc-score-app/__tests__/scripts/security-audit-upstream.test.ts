import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CANONICAL_NPM_REGISTRY,
  NPM_VIEW_TIMEOUT_MS,
  formatCompatiblePrismaReleaseStatus,
  getPrismaVersionSelector,
  inspectCompatiblePrismaRelease,
  runNpmView,
  selectLatestVersion,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream.js';

describe('compatible Prisma upstream probe', () => {
  const manifest = {
    devDependencies: {
      prisma: '^6.19.3',
    },
  };

  it('reads the Prisma selector from the manifest', () => {
    expect(getPrismaVersionSelector(manifest)).toBe('^6.19.3');
  });

  it('rejects unsafe Prisma selectors before invoking npm', () => {
    expect(() =>
      getPrismaVersionSelector({ devDependencies: { prisma: '^6.19.3\n--registry=https://example.test/' } }),
    ).toThrow('devDependencies.prisma');
  });

  it('selects the newest comparable stable version', () => {
    expect(selectLatestVersion(['6.19.3', '6.20.0-dev.1', '6.20.0', '6.19.4'])).toBe('6.20.0');
  });

  it('ignores newer prerelease versions when selecting the remediation candidate', () => {
    expect(selectLatestVersion(['6.19.3', '6.20.0-dev.10', '6.19.4'])).toBe('6.19.4');
  });

  it('fails closed when npm only returns prerelease versions', () => {
    expect(() => selectLatestVersion(['6.20.0-dev.1', '6.20.0-rc.1'])).toThrow(
      'npm view returned no stable compatible Prisma versions',
    );
  });

  it('accepts the version-prefixed JSON object shape emitted for npm view ranges', () => {
    expect(
      selectLatestVersion({
        'prisma@6.19.3': '6.19.3',
        'prisma@6.19.4': '6.19.4',
      }),
    ).toBe('6.19.4');
  });

  it('reports when the latest compatible release still depends on vulnerable deepmerge-ts', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      if (selector === 'prisma@^6.19.3' && field === 'version') {
        return ['6.19.3'];
      }
      if (selector === '@prisma/config@6.19.3' && field === 'dependencies.deepmerge-ts') {
        return '7.1.5';
      }
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    expect(inspectCompatiblePrismaRelease({ manifest, npmView })).toEqual({
      state: 'compatible-release-still-vulnerable',
      registry: CANONICAL_NPM_REGISTRY,
      prismaSelector: '^6.19.3',
      latestCompatiblePrismaVersion: '6.19.3',
      prismaConfigDeepmergeRequirement: '7.1.5',
    });
  });

  it('reports a compatible forward-remediation release only when the Prisma dependency edge is patched', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      if (selector === 'prisma@^6.19.3' && field === 'version') {
        return ['6.19.3', '6.20.0'];
      }
      if (selector === '@prisma/config@6.20.0' && field === 'dependencies.deepmerge-ts') {
        return '8.0.2';
      }
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    expect(inspectCompatiblePrismaRelease({ manifest, npmView }).state).toBe(
      'compatible-forward-remediation-available',
    );
  });

  it('does not probe a prerelease even if it is newer than the latest stable version', () => {
    const npmView = jest.fn((selector: string, field: string) => {
      if (selector === 'prisma@^6.19.3' && field === 'version') {
        return ['6.19.3', '6.20.0-dev.10', '6.19.4'];
      }
      if (selector === '@prisma/config@6.19.4' && field === 'dependencies.deepmerge-ts') {
        return '7.1.5';
      }
      throw new Error(`unexpected npm view: ${selector} ${field}`);
    });

    expect(inspectCompatiblePrismaRelease({ manifest, npmView }).latestCompatiblePrismaVersion).toBe('6.19.4');
    expect(npmView).not.toHaveBeenCalledWith('@prisma/config@6.20.0-dev.10', 'dependencies.deepmerge-ts');
  });

  it('pins npm view to the canonical registry and bounds each request', () => {
    const spawn = jest.fn(() => ({
      status: 0,
      stdout: '"6.19.3"\n',
      stderr: '',
      error: undefined,
    }));

    expect(runNpmView('prisma@^6.19.3', 'version', spawn as never)).toBe('6.19.3');
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['view', 'prisma@^6.19.3', 'version', '--json', `--registry=${CANONICAL_NPM_REGISTRY}`],
      { encoding: 'utf8', timeout: NPM_VIEW_TIMEOUT_MS },
    );
  });

  it('fails closed when npm view times out', () => {
    const spawn = jest.fn(() => ({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawnSync npm ETIMEDOUT'),
    }));

    expect(() => runNpmView('prisma@^6.19.3', 'version', spawn as never)).toThrow(
      'failed to run npm view for prisma@^6.19.3: spawnSync npm ETIMEDOUT',
    );
  });

  it('formats review evidence without implying that the dependency was changed', () => {
    const text = formatCompatiblePrismaReleaseStatus({
      state: 'compatible-release-still-vulnerable',
      registry: CANONICAL_NPM_REGISTRY,
      prismaSelector: '^6.19.3',
      latestCompatiblePrismaVersion: '6.19.3',
      prismaConfigDeepmergeRequirement: '7.1.5',
    });

    expect(text).toContain('compatible Prisma upstream status: compatible-release-still-vulnerable');
    expect(text).toContain('latest compatible prisma: 6.19.3');
    expect(text).toContain('@prisma/config -> deepmerge-ts requirement: 7.1.5');
  });

  it('publishes single-line GitHub Actions outputs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'security-audit-upstream-'));
    const outputPath = path.join(directory, 'github-output.txt');

    try {
      writeGitHubOutputs(
        {
          state: 'compatible-release-still-vulnerable',
          registry: CANONICAL_NPM_REGISTRY,
          prismaSelector: '^6.19.3',
          latestCompatiblePrismaVersion: '6.19.3',
          prismaConfigDeepmergeRequirement: '7.1.5',
        },
        outputPath,
      );

      const output = fs.readFileSync(outputPath, 'utf8');
      expect(output).toContain('state=compatible-release-still-vulnerable\n');
      expect(output).toContain('latest_compatible_prisma_version=6.19.3\n');
      expect(output).toContain('prisma_config_deepmerge_requirement=7.1.5\n');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
