import {
  CANONICAL_NPM_REGISTRY,
  formatCompatiblePrismaReleaseStatus,
  parseCliOptions,
} from '../../scripts/security-audit-upstream.js';

describe('compatible Prisma upstream probe CLI', () => {
  const status = {
    state: 'compatible-release-still-vulnerable',
    registry: CANONICAL_NPM_REGISTRY,
    prismaSelector: '^6.19.3',
    latestCompatiblePrismaVersion: '6.19.3',
    prismaConfigSelector: '6.19.3',
    latestCompatiblePrismaConfigVersion: '6.19.3',
    prismaConfigDeepmergeRequirement: '7.1.5',
  };

  it('accepts only the documented --json option', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--pretty'])).toThrow('Unknown option: --pretty');
  });

  it('emits one machine-readable JSON object without human-oriented prefixes', () => {
    const output = formatCompatiblePrismaReleaseStatus(status, { json: true });

    expect(output.endsWith('\n')).toBe(true);
    expect(output).not.toContain('compatible Prisma upstream status:');
    expect(JSON.parse(output)).toEqual(status);
  });

  it('keeps the existing human-readable format as the default', () => {
    const output = formatCompatiblePrismaReleaseStatus(status);

    expect(output).toContain('compatible Prisma upstream status: compatible-release-still-vulnerable');
    expect(output).toContain('latest compatible prisma: 6.19.3');
  });
});
