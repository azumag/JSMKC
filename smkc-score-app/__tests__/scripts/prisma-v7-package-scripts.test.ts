import fs from 'node:fs';
import path from 'node:path';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

describe('Prisma 7 readiness package scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;

  it('exposes stable entrypoints for the read-only migration probes', () => {
    expect(packageJson.scripts).toMatchObject({
      'prisma:v7:readiness': 'node scripts/prisma-v7-readiness.cjs',
      'prisma:v7:readiness:json': 'node scripts/prisma-v7-readiness.cjs --json',
      'prisma:v7:typescript-prereqs': 'node scripts/prisma-v7-typescript-prereqs.cjs',
      'prisma:v7:env-loading': 'node scripts/prisma-v7-env-loading.cjs',
      'prisma:v7:removed-surfaces': 'node scripts/prisma-v7-removed-surfaces.cjs',
      'prisma:v7:support-surface': 'node scripts/prisma-v7-support-surface.cjs',
      'prisma:v7:esm-surface': 'node scripts/prisma-v7-esm-surface.cjs',
    });
  });

  it('runs the complete advisory review in a stable order', () => {
    expect(packageJson.scripts?.['prisma:v7:review']).toBe(
      'npm run prisma:v7:readiness && npm run prisma:v7:typescript-prereqs && npm run prisma:v7:env-loading && npm run prisma:v7:removed-surfaces && npm run prisma:v7:support-surface && npm run prisma:v7:esm-surface',
    );
  });
});
