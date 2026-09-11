import { readFileSync } from 'node:fs';

import {
  extractSemverMajor,
  prismaConfigHasDatasourceUrl,
} from '../../scripts/prisma-v7-readiness.cjs';

describe('Prisma datasource config migration', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  const prismaConfig = readFileSync('prisma.config.ts', 'utf8');

  it(
    'keeps DATABASE_URL available through prisma.config.ts without breaking generate-only CI',
    () => {
      expect(prismaConfigHasDatasourceUrl(prismaConfig)).toBe(true);
      expect(prismaConfig).toMatch(
        /url\s*:\s*process\.env\.DATABASE_URL\s*\?\?\s*["']{2}/,
      );
    },
  );

  it(
    'keeps the Prisma 6 compatibility engine while the CLI remains on major 6',
    () => {
      const prismaMajor = extractSemverMajor(
        manifest.devDependencies?.prisma ?? null,
      );

      if (prismaMajor === 6) {
        expect(prismaConfig).toMatch(/engine\s*:\s*["']classic["']/);
      }
    },
  );
});
