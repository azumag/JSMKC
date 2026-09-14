import {
  getPrismaConfigVersionSelector,
  getPrismaVersionSelector,
  getRuntimePackageVersionSelector,
  inspectCompatiblePrismaRelease,
  isCurrentCompatiblePrismaSelector,
  isRegistrySemverSelector,
} from '../../scripts/security-audit-upstream.js';
import { getNextMajorPrismaSelector } from '../../scripts/security-audit-next-major.js';

describe('security audit Prisma selector policy', () => {
  const validVersions = ['6.19.3', '^6.19.3', '~6.19.3', '^6.19.3-rc.1+build.5', '^6.19.3-1a.01a+build.5'];
  const malformedVersions = [
    '^06.19.3',
    '^6.01.3',
    '^6.19.03',
    '^6.19.3-01',
    '^6.not-semver',
    '6.19',
    '6.19.3 || 7.0.0',
    'workspace:*',
    'npm:prisma@6.19.3',
  ];

  it('accepts complete exact/caret/tilde SemVer selectors for current-compatible Prisma probing', () => {
    for (const selector of validVersions) {
      expect(isCurrentCompatiblePrismaSelector(selector)).toBe(true);
      expect(getPrismaVersionSelector({ devDependencies: { prisma: selector } })).toBe(selector);
    }
  });

  it('rejects malformed or ambiguous current-compatible Prisma selectors', () => {
    for (const selector of [...malformedVersions, '>=6.19.3', '>6.19.3', '<=6.19.3', '<6.19.3']) {
      expect(isCurrentCompatiblePrismaSelector(selector)).toBe(false);
      expect(() => getPrismaVersionSelector({ devDependencies: { prisma: selector } })).toThrow(
        'devDependencies.prisma',
      );
    }
  });

  it('does not start a registry lookup when the manifest Prisma selector is malformed', () => {
    for (const selector of malformedVersions) {
      const npmView = jest.fn();

      expect(() =>
        inspectCompatiblePrismaRelease({
          manifest: { devDependencies: { prisma: selector } },
          npmView,
        }),
      ).toThrow('devDependencies.prisma');
      expect(npmView).not.toHaveBeenCalled();
    }
  });

  it('keeps single-comparator registry selectors while enforcing complete SemVer syntax', () => {
    for (const selector of ['6.19.3', '^6.19.3', '~6.19.3', '>=6.19.3', '>6.19.3', '<=7.0.0', '<7.0.0']) {
      expect(isRegistrySemverSelector(selector)).toBe(true);
    }

    for (const selector of malformedVersions) {
      expect(isRegistrySemverSelector(selector)).toBe(false);
    }

    expect(getPrismaConfigVersionSelector({ '@prisma/config': '^7.10.0-rc.1+build.2' })).toBe('^7.10.0-rc.1+build.2');
    expect(getRuntimePackageVersionSelector({ dependencies: { '@prisma/client': '>=7.10.0' } }, '@prisma/client')).toBe(
      '>=7.10.0',
    );
  });

  it('keeps the next-major probe caret-only and rejects malformed caret selectors', () => {
    expect(getNextMajorPrismaSelector({ devDependencies: { prisma: '^6.19.3' } })).toBe('^7.0.0');
    expect(getNextMajorPrismaSelector({ devDependencies: { prisma: '^6.19.3-1a.01a+build.5' } })).toBe('^7.0.0');

    for (const selector of ['~6.19.3', '6.19.3', ...malformedVersions]) {
      expect(() => getNextMajorPrismaSelector({ devDependencies: { prisma: selector } })).toThrow();
    }
  });
});
