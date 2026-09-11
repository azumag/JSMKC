import {
  extractLegacyPrismaClientSpecifiers,
  extractSemverMajor,
  formatPrismaV7Readiness,
  inspectPrismaV7Readiness,
  parseCliOptions,
  prismaConfigHasDatasourceUrl,
} from '../../scripts/prisma-v7-readiness.cjs';

describe('Prisma 7 migration readiness probe', () => {
  const currentManifest = {
    dependencies: {
      '@prisma/adapter-d1': '^7.8.0',
      '@prisma/client': '^6.19.3',
    },
    devDependencies: {
      prisma: '^6.19.3',
    },
  };

  const currentSchema = `
    generator client {
      provider = "prisma-client-js"
    }

    datasource db {
      provider = "sqlite"
      url = env("DATABASE_URL")
    }
  `;

  const currentPrismaConfig = `
    import { defineConfig } from "prisma/config";

    export default defineConfig({
      schema: "prisma/schema.prisma",
      migrations: {
        path: "prisma/migrations",
      },
    });
  `;

  const currentLegacyImports = [
    {
      path: 'src/lib/prisma.ts',
      specifiers: ['@prisma/client'],
    },
    {
      path: 'src/lib/prisma-error.ts',
      specifiers: ['@prisma/client/runtime/library'],
    },
  ];

  it('reports the current repository migration items without mutating them', () => {
    const status = inspectPrismaV7Readiness({
      manifest: currentManifest,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      legacyPrismaClientImports: currentLegacyImports,
    });

    expect(status.ready).toBe(false);
    expect(status.selectors).toEqual({
      prisma: '^6.19.3',
      prismaClient: '^6.19.3',
      prismaAdapterD1: '^7.8.0',
    });
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        'packageTypeModule',
        'prismaCliAtTargetMajor',
        'prismaClientAtTargetMajor',
        'prismaPackageMajorsAligned',
        'generatorUsesPrismaClient',
        'generatorHasExplicitOutput',
        'datasourceUrlMovedOutOfSchema',
        'prismaConfigHasDatasourceUrl',
        'applicationImportsUseGeneratedClient',
      ]),
    );
    expect(status.blockers).not.toContain('prismaAdapterAtTargetMajor');
    expect(status.blockers).not.toContain('prismaConfigPresent');
  });

  it('reports ready only when the v7 package, schema, and config prerequisites are explicit', () => {
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
        import { defineConfig, env } from "prisma/config";

        export default defineConfig({
          schema: "prisma/schema.prisma",
          datasource: {
            url: env("DATABASE_URL"),
          },
        });
      `,
      legacyPrismaClientImports: [],
    });

    expect(status.ready).toBe(true);
    expect(status.blockerCount).toBe(0);
    expect(status.blockers).toEqual([]);
  });

  it('requires datasource.url inside the Prisma config instead of treating file presence as sufficient', () => {
    expect(prismaConfigHasDatasourceUrl(currentPrismaConfig)).toBe(false);
    expect(
      prismaConfigHasDatasourceUrl(`
        export default defineConfig({
          schema: "prisma/schema.prisma",
          datasource: {
            url: env("DATABASE_URL"),
          },
        });
      `),
    ).toBe(true);
    expect(
      prismaConfigHasDatasourceUrl(`
        // url: env("DATABASE_URL")
        export default defineConfig({ schema: "prisma/schema.prisma" });
      `),
    ).toBe(false);
    expect(prismaConfigHasDatasourceUrl(null)).toBe(false);
  });

  it('finds package and runtime imports that must move to the generated client', () => {
    expect(
      extractLegacyPrismaClientSpecifiers(`
        import { PrismaClient } from '@prisma/client';
        import type { Prisma } from "@prisma/client";
        const requestError = require('@prisma/client/runtime/library');
        const dynamicClient = import("@prisma/client");
        import '@/lib/local-module';
      `),
    ).toEqual(['@prisma/client', '@prisma/client/runtime/library']);
  });

  it('parses supported selectors conservatively', () => {
    expect(extractSemverMajor('^7.10.0')).toBe(7);
    expect(extractSemverMajor('~6.19.3')).toBe(6);
    expect(extractSemverMajor('7.10.0')).toBe(7);
    expect(extractSemverMajor('workspace:*')).toBeNull();
    expect(extractSemverMajor(null)).toBeNull();
  });

  it('keeps the human-readable output explicitly read-only', () => {
    const status = inspectPrismaV7Readiness({
      manifest: currentManifest,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      legacyPrismaClientImports: currentLegacyImports,
    });
    const output = formatPrismaV7Readiness(status);

    expect(output).toContain('Overall readiness: `not-ready`');
    expect(output).toContain('@prisma/adapter-d1');
    expect(output).toContain('src/lib/prisma.ts');
    expect(output).toContain('@prisma/client/runtime/library');
    expect(output).toContain('prismaConfigHasDatasourceUrl');
    expect(output).toContain('read-only migration evidence');
    expect(output).not.toContain('dependencies updated');
  });

  it('supports machine-readable JSON and rejects unknown options', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--write'])).toThrow('unsupported option');

    const status = inspectPrismaV7Readiness({
      manifest: currentManifest,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      legacyPrismaClientImports: currentLegacyImports,
    });
    expect(JSON.parse(formatPrismaV7Readiness(status, { json: true }))).toMatchObject({
      targetMajor: 7,
      ready: false,
    });
  });
});
