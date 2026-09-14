import {
  getPrismaConfigVersionSelector,
  getPrismaVersionSelector,
  isCurrentCompatiblePrismaSelector,
  isRegistrySemverSelector,
} from '../../scripts/security-audit-upstream.js';

describe('compatible Prisma upstream selector boundaries', () => {
  it.each(['6.19.3', '^6.19.3', '~6.19.3', '>=6.19.3', '<7.0.0', '6.20.0-rc.1'])(
    'accepts registry SemVer selector %s',
    (selector) => {
      expect(isRegistrySemverSelector(selector)).toBe(true);
    },
  );

  it.each(['6.19.3', '^6.19.3', '~6.19.3', '6.20.0-rc.1'])(
    'accepts bounded current-compatible Prisma selector %s',
    (selector) => {
      expect(isCurrentCompatiblePrismaSelector(selector)).toBe(true);
      expect(getPrismaVersionSelector({ devDependencies: { prisma: selector } })).toBe(selector);
    },
  );

  it.each(['>=6.19.3', '>6.19.3', '<=7.0.0', '<7.0.0'])(
    'rejects directional current-compatible Prisma selector %s',
    (selector) => {
      expect(isCurrentCompatiblePrismaSelector(selector)).toBe(false);
      expect(() => getPrismaVersionSelector({ devDependencies: { prisma: selector } })).toThrow(
        'exact, caret, or tilde registry SemVer selector',
      );
    },
  );

  it.each([
    'latest',
    '*',
    'npm:other-package@6.19.3',
    'file:../prisma',
    'https://example.test/prisma.tgz',
    'git+https://example.test/prisma.git',
    '^6.19.3\n--registry=https://example.test/',
  ])('rejects non-registry or ambiguous selector %s', (selector) => {
    expect(isRegistrySemverSelector(selector)).toBe(false);
  });

  it('fails closed before npm lookup when package.json points Prisma at a non-registry source', () => {
    expect(() => getPrismaVersionSelector({ devDependencies: { prisma: 'file:../prisma' } })).toThrow(
      'registry SemVer selector',
    );
  });

  it('fails closed before the second npm lookup when Prisma metadata uses a non-registry @prisma/config source', () => {
    expect(() => getPrismaConfigVersionSelector({ '@prisma/config': 'npm:shadow-config@6.19.3' })).toThrow(
      'registry SemVer',
    );
  });
});
