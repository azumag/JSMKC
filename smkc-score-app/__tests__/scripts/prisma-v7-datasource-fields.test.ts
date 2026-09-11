import { inspectPrismaV7Readiness } from '../../scripts/prisma-v7-readiness.cjs';

function inspectSchema(schema: string) {
  return inspectPrismaV7Readiness({
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
        'node_modules/@prisma/client': { version: '7.10.0' },
        'node_modules/@prisma/adapter-d1': { version: '7.10.0' },
      },
    },
    schema,
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
}

describe('Prisma 7 removed datasource fields', () => {
  it('keeps directUrl and shadowDatabaseUrl in schema as explicit migration blockers', () => {
    const status = inspectSchema(`
      generator client {
        provider = "prisma-client"
        output = "../src/generated/prisma"
      }

      datasource db {
        provider = "sqlite"
        directUrl = env("DIRECT_DATABASE_URL")
        shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
      }
    `);

    expect(status.checks.datasourceUrlMovedOutOfSchema).toBe(true);
    expect(status.checks.datasourceDirectUrlMovedOutOfSchema).toBe(false);
    expect(status.checks.datasourceShadowDatabaseUrlMovedOutOfSchema).toBe(false);
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        'datasourceDirectUrlMovedOutOfSchema',
        'datasourceShadowDatabaseUrlMovedOutOfSchema',
      ]),
    );
  });

  it('accepts a Prisma 7 datasource block once all connection URL fields are outside schema.prisma', () => {
    const status = inspectSchema(`
      generator client {
        provider = "prisma-client"
        output = "../src/generated/prisma"
      }

      datasource db {
        provider = "sqlite"
      }
    `);

    expect(status.checks.datasourceUrlMovedOutOfSchema).toBe(true);
    expect(status.checks.datasourceDirectUrlMovedOutOfSchema).toBe(true);
    expect(status.checks.datasourceShadowDatabaseUrlMovedOutOfSchema).toBe(true);
  });
});
