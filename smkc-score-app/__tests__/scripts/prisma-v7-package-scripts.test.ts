import fs from 'node:fs';
import path from 'node:path';

import { PRISMA_V7_REVIEW_PROBES } from '../../scripts/prisma-v7-review-json.cjs';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

function packageScriptName(probeScript: string) {
  return `prisma:v7:${probeScript.replace(/^prisma-v7-/, '').replace(/\.cjs$/, '')}`;
}

describe('Prisma 7 readiness package scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;

  it('exposes stable human and JSON entrypoints for every aggregate review probe', () => {
    expect(packageJson.scripts?.['prisma:v7:review:json']).toBe('node scripts/prisma-v7-review-json.cjs');

    for (const probe of PRISMA_V7_REVIEW_PROBES) {
      const scriptName = packageScriptName(probe.script);
      expect(packageJson.scripts?.[scriptName]).toBe(`node scripts/${probe.script}`);
      expect(packageJson.scripts?.[`${scriptName}:json`]).toBe(`node scripts/${probe.script} --json`);
    }
  });

  it('runs the complete advisory review in the same stable order as the aggregate manifest', () => {
    const expectedReviewCommand = PRISMA_V7_REVIEW_PROBES.map(
      (probe) => `npm run ${packageScriptName(probe.script)}`,
    ).join(' && ');

    expect(packageJson.scripts?.['prisma:v7:review']).toBe(expectedReviewCommand);
  });
});
