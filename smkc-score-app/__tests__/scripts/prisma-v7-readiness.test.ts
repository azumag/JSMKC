import { readFileSync } from 'node:fs';

import {
  extractLegacyPrismaClientSpecifiers,
  extractSemverMajor,
  extractTsconfigCompilerOption,
  formatPrismaV7Readiness,
  getInstalledPrismaPackageVersions,
  inspectPrismaV7Readiness,
  nodeVersionSupportsPrisma7,
  parseCliOptions,
  prismaConfigHasDatasourceUrl,
  prismaConfigHasEngineSetting,
  tsTargetSupportsPrisma7,
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

  const currentLockfile = {
    packages: {
      'node_modules/prisma': { version: '6.19.3' },
      'node_modules/@prisma/client': { version: '6.19.3' },
      'node_modules/@prisma/adapter-d1': { version: '7.8.0' },
    },
  };

  const prisma7Lockfile = {
    packages: {
      'node_modules/prisma': { version: '7.10.0' },
      'node_modules/@prisma/client': { version: '7.10.0' },
      'node_modules/@prisma/adapter-d1': { version: '7.10.0' },
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
      engine: "classic",
      migrations: {
        path: "prisma/migrations",
      },
      datasource: {
        url: process.env.DATABASE_URL ?? "",
      },
    });
  `;

  const currentTsconfig = `
    {
      "compilerOptions": {
        "target": "ES2023",
        "module": "esnext",
        "moduleResolution": "bundler"
      }
    }
  `;

  const prisma7Tsconfig = `
    {
      "compilerOptions": {
        "target": "ES2023",
        "module": "ESNext",
        "moduleResolution": "bundler"
      }
    }
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

  const supportedNodeVersion = '22.12.0';

  it('reports the current repository migration items without mutating them', () => {
    const status = inspectPrismaV7Readiness({
      manifest: currentManifest,
      lockfile: currentLockfile,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      tsconfigSource: currentTsconfig,
      legacyPrismaClientImports: currentLegacyImports,
      nodeVersion: supportedNodeVersion,
    });

    expect(status.ready).toBe(false);
    expect(status.runtime).toEqual({ node: supportedNodeVersion });
    expect(status.selectors).toEqual({
      prisma: '^6.19.3',
      prismaClient: '^6.19.3',
      prismaAdapterD1: '^7.8.0',
    });
    expect(status.installedVersions).toEqual({
      prisma: '6.19.3',
      prismaClient: '6.19.3',
      prismaAdapterD1: '7.8.0',
    });
    expect(status.tsconfig).toEqual({
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'ES2023',
    });
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        'packageTypeModule',
        'prismaCliAtTargetMajor',
        'prismaClientAtTargetMajor',
        'prismaPackageMajorsAligned',
        'installedPrismaCliAtTargetMajor',
        'installedPrismaClientAtTargetMajor',
        'installedPrismaPackageMajorsAligned',
        'generatorUsesPrismaClient',
        'generatorHasExplicitOutput',
        'datasourceUrlMovedOutOfSchema',
        'prismaConfigOmitsRemovedEngine',
        'applicationImportsUseGeneratedClient',
      ]),
    );
    expect(status.blockers).not.toContain('nodeRuntimeSupportsPrisma7');
    expect(status.blockers).not.toContain('prismaAdapterAtTargetMajor');
    expect(status.blockers).not.toContain('lockfilePresent');
    expect(status.blockers).not.toContain('installedPrismaAdapterAtTargetMajor');
    expect(status.blockers).not.toContain('prismaConfigPresent');
    expect(status.blockers).not.toContain('prismaConfigHasDatasourceUrl');
    expect(status.blockers).not.toContain('tsconfigPresent');
    expect(status.blockers).not.toContain('tsconfigModuleEsNext');
    expect(status.blockers).not.toContain('tsconfigModuleResolutionBundler');
    expect(status.blockers).not.toContain('tsconfigTargetEs2023OrNewer');
  });

  it('reports ready only when the v7 package, lockfile, schema, config, runtime, and TypeScript prerequisites are explicit', () => {
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
      lockfile: prisma7Lockfile,
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
      tsconfigSource: prisma7Tsconfig,
      legacyPrismaClientImports: [],
      nodeVersion: supportedNodeVersion,
    });

    expect(status.ready).toBe(true);
    expect(status.blockerCount).toBe(0);
    expect(status.blockers).toEqual([]);
  });

  it('fails readiness when the lockfile does not prove the installed Prisma package set', () => {
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
          'node_modules/@prisma/client': { version: '7.10.0' },
          'node_modules/@prisma/adapter-d1': { version: '6.19.3' },
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
      tsconfigSource: prisma7Tsconfig,
      legacyPrismaClientImports: [],
      nodeVersion: supportedNodeVersion,
    });

    expect(status.blockers).toEqual(
      expect.arrayContaining(['installedPrismaAdapterAtTargetMajor', 'installedPrismaPackageMajorsAligned']),
    );
  });

  it('reads installed Prisma versions from package-lock evidence conservatively', () => {
    expect(getInstalledPrismaPackageVersions(currentLockfile)).toEqual({
      prisma: '6.19.3',
      prismaClient: '6.19.3',
      prismaAdapterD1: '7.8.0',
    });
    expect(getInstalledPrismaPackageVersions({ packages: {} })).toEqual({
      prisma: null,
      prismaClient: null,
      prismaAdapterD1: null,
    });
    expect(getInstalledPrismaPackageVersions(null)).toEqual({
      prisma: null,
      prismaClient: null,
      prismaAdapterD1: null,
    });
  });

  it('keeps repository package-lock Prisma majors visible as migration evidence', () => {
    const repositoryLockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const installedVersions = getInstalledPrismaPackageVersions(repositoryLockfile);

    expect(extractSemverMajor(installedVersions.prisma)).toBe(6);
    expect(extractSemverMajor(installedVersions.prismaClient)).toBe(6);
    expect(extractSemverMajor(installedVersions.prismaAdapterD1)).toBe(7);
  });

  it('tracks Prisma 7 Node.js runtime support explicitly', () => {
    expect(nodeVersionSupportsPrisma7('20.19.0')).toBe(true);
    expect(nodeVersionSupportsPrisma7('20.20.1')).toBe(true);
    expect(nodeVersionSupportsPrisma7('20.18.9')).toBe(false);
    expect(nodeVersionSupportsPrisma7('22.12.0')).toBe(true);
    expect(nodeVersionSupportsPrisma7('v22.14.1')).toBe(true);
    expect(nodeVersionSupportsPrisma7('22.11.0')).toBe(false);
    expect(nodeVersionSupportsPrisma7('24.0.0')).toBe(true);
    expect(nodeVersionSupportsPrisma7('23.11.0')).toBe(false);
    expect(nodeVersionSupportsPrisma7('25.0.0')).toBe(false);
    expect(nodeVersionSupportsPrisma7('22.12.0-rc.1')).toBe(false);
    expect(nodeVersionSupportsPrisma7(null)).toBe(false);

    const status = inspectPrismaV7Readiness({
      manifest: currentManifest,
      lockfile: currentLockfile,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      tsconfigSource: currentTsconfig,
      legacyPrismaClientImports: currentLegacyImports,
      nodeVersion: '22.11.0',
    });

    expect(status.blockers).toContain('nodeRuntimeSupportsPrisma7');
  });

  it('requires datasource.url inside the Prisma config instead of treating file presence as sufficient', () => {
    expect(prismaConfigHasDatasourceUrl(currentPrismaConfig)).toBe(true);
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
    expect(
      prismaConfigHasDatasourceUrl(`
        // datasource: { url: env("DATABASE_URL") }
        export default defineConfig({ schema: "prisma/schema.prisma" });
      `),
    ).toBe(false);
    expect(prismaConfigHasDatasourceUrl(null)).toBe(false);
  });

  it('tracks the Prisma 6-only engine setting as a Prisma 7 migration blocker', () => {
    expect(prismaConfigHasEngineSetting(currentPrismaConfig)).toBe(true);
    expect(
      prismaConfigHasEngineSetting(`
        export default defineConfig({
          schema: "prisma/schema.prisma",
          datasource: { url: env("DATABASE_URL") },
        });
      `),
    ).toBe(false);
    expect(
      prismaConfigHasEngineSetting(`
        // engine: "classic"
        export default defineConfig({ schema: "prisma/schema.prisma" });
      `),
    ).toBe(false);
    expect(prismaConfigHasEngineSetting(null)).toBe(false);
  });

  it('keeps the repository Prisma config on the staged v6 datasource path until the major migration', () => {
    const repositoryPrismaConfig = readFileSync('prisma.config.ts', 'utf8');

    expect(prismaConfigHasDatasourceUrl(repositoryPrismaConfig)).toBe(true);
    expect(prismaConfigHasEngineSetting(repositoryPrismaConfig)).toBe(true);
  });

  it('checks the TypeScript module settings required by the Prisma 7 migration guide', () => {
    expect(extractTsconfigCompilerOption(prisma7Tsconfig, 'module')).toBe('ESNext');
    expect(extractTsconfigCompilerOption(prisma7Tsconfig, 'moduleResolution')).toBe('bundler');
    expect(extractTsconfigCompilerOption(prisma7Tsconfig, 'target')).toBe('ES2023');
    expect(extractTsconfigCompilerOption(null, 'target')).toBeNull();

    expect(tsTargetSupportsPrisma7('ES2023')).toBe(true);
    expect(tsTargetSupportsPrisma7('es2024')).toBe(true);
    expect(tsTargetSupportsPrisma7('ESNext')).toBe(true);
    expect(tsTargetSupportsPrisma7('ES2022')).toBe(false);
    expect(tsTargetSupportsPrisma7(null)).toBe(false);
  });

  it('keeps the repository TypeScript target at a Prisma 7 compatible level', () => {
    const repositoryTsconfig = readFileSync('tsconfig.json', 'utf8');
    const target = extractTsconfigCompilerOption(repositoryTsconfig, 'target');

    expect(target).not.toBeNull();
    expect(tsTargetSupportsPrisma7(target)).toBe(true);
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
      lockfile: currentLockfile,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      tsconfigSource: currentTsconfig,
      legacyPrismaClientImports: currentLegacyImports,
      nodeVersion: supportedNodeVersion,
    });
    const output = formatPrismaV7Readiness(status);

    expect(output).toContain('Overall readiness: `not-ready`');
    expect(output).toContain('@prisma/adapter-d1');
    expect(output).toContain('Installed version');
    expect(output).toContain('| prisma | `^6.19.3` | `6.19.3` |');
    expect(output).toContain('| @prisma/adapter-d1 | `^7.8.0` | `7.8.0` |');
    expect(output).toContain('installedPrismaPackageMajorsAligned');
    expect(output).toContain('Runtime requirements');
    expect(output).toContain('| Node.js | `22.12.0` |');
    expect(output).toContain('nodeRuntimeSupportsPrisma7');
    expect(output).toContain('src/lib/prisma.ts');
    expect(output).toContain('@prisma/client/runtime/library');
    expect(output).toContain('prismaConfigHasDatasourceUrl');
    expect(output).toContain('prismaConfigOmitsRemovedEngine');
    expect(output).toContain('TypeScript module settings');
    expect(output).toContain('| target | `ES2023` |');
    expect(output).toContain('tsconfigTargetEs2023OrNewer');
    expect(output).toContain('read-only migration evidence');
    expect(output).not.toContain('dependencies updated');
  });

  it('supports machine-readable JSON and rejects unknown options', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--write'])).toThrow('unsupported option');

    const status = inspectPrismaV7Readiness({
      manifest: currentManifest,
      lockfile: currentLockfile,
      schema: currentSchema,
      prismaConfigSource: currentPrismaConfig,
      tsconfigSource: currentTsconfig,
      legacyPrismaClientImports: currentLegacyImports,
      nodeVersion: supportedNodeVersion,
    });
    expect(JSON.parse(formatPrismaV7Readiness(status, { json: true }))).toMatchObject({
      targetMajor: 7,
      ready: false,
      runtime: {
        node: supportedNodeVersion,
      },
      installedVersions: {
        prisma: '6.19.3',
        prismaClient: '6.19.3',
        prismaAdapterD1: '7.8.0',
      },
      tsconfig: {
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'ES2023',
      },
    });
  });
});
