import packageJson from '../../package.json';
import { isPreV7PrismaSelector } from '../../scripts/prisma-major-check';

describe('scripts/prisma-major-check', () => {
  it('accepts supported pre-v7 Prisma selectors', () => {
    expect(isPreV7PrismaSelector('^6.19.3')).toBe(true);
    expect(isPreV7PrismaSelector('~5.22.0')).toBe(true);
    expect(isPreV7PrismaSelector('6.19.3')).toBe(true);
  });

  it('fails closed for Prisma 7+, unknown selectors, and missing values', () => {
    expect(isPreV7PrismaSelector('^7.10.0')).toBe(false);
    expect(isPreV7PrismaSelector('8.0.0')).toBe(false);
    expect(isPreV7PrismaSelector('workspace:*')).toBe(false);
    expect(isPreV7PrismaSelector(undefined)).toBe(false);
  });

  it('classifies the repository current Prisma selector as pre-v7', () => {
    expect(isPreV7PrismaSelector(packageJson.devDependencies.prisma)).toBe(true);
  });

  it('guards the Cloudflare prebuild legacy engine environment with the major check', () => {
    const prebuild = packageJson.scripts['prebuild:cf'];

    expect(prebuild).toContain('node scripts/prisma-major-check.js');
    expect(prebuild).toContain('PRISMA_SCHEMA_ENGINE_BINARY=/dev/null');
    expect(prebuild).toContain('PRISMA_QUERY_ENGINE_LIBRARY=/dev/null');
    expect(prebuild).toContain('PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1');
    expect(prebuild).toContain('else prisma generate; fi');
    expect(packageJson.scripts.postinstall).toBe('node scripts/prisma-generate.js');
  });
});
