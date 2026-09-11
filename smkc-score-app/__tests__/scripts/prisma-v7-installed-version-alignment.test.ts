import { inspectPrismaV7Readiness } from '../../scripts/prisma-v7-readiness.cjs';

describe('Prisma 7 installed package release alignment', () => {
  it('keeps same-major but mixed release versions as a migration blocker', () => {
    const status = inspectPrismaV7Readiness({
      manifest: {
        type: 'module',
        dependencies: {
          '@prisma/adapter-d1': '^7.10.0',
          '@prisma/client': '^7.10.0',
        },
        devDependencies: {
          prisma: '^7.10.0',
        },
      },
      lockfile: {
        packages: {
          'node_modules/prisma': { version: '7.10.0' },
          'node_modules/@prisma/client': { version: '7.9.0' },
          'node_modules/@prisma/adapter-d1': { version: '7.8.0' },
        },
      },
      schema: `
        generator client {
          provider = "prisma-client"
          output = "../src/generated/prisma"
        }
        datasource db {
          provider = "sqlite"
        }
      `,
      prismaConfigSource: `
        export default defineConfig({
          datasource: { url: env("DATABASE_URL") },
        });
      `,
      tsconfigSource: `
        {
          "compilerOptions": {
            "target": "ES2023",
            "module": "ESNext",
            "moduleResolution": "bundler"
          }
        }
      `,
      legacyPrismaClientImports: [],
      nodeVersion: '22.12.0',
    });

    expect(status.blockers).not.toContain('installedPrismaPackageMajorsAligned');
    expect(status.blockers).toContain('installedPrismaPackageVersionsAligned');
  });
});
