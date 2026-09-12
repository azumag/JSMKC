import { readFileSync } from 'node:fs';

import {
  extractBooleanCompilerOption,
  formatPrismaV7TypeScriptPrerequisites,
  getLockedTypeScriptVersion,
  inspectPrismaV7TypeScriptPrerequisites,
  parseCliOptions,
  parseStableSemver,
  readTypeScriptVersionEvidence,
  typescriptVersionSupportsPrisma7,
} from '../../scripts/prisma-v7-typescript-prereqs.cjs';

describe('Prisma 7 TypeScript prerequisites', () => {
  it('accepts stable TypeScript releases at or above the Prisma 7 minimum', () => {
    expect(typescriptVersionSupportsPrisma7('5.4.0')).toBe(true);
    expect(typescriptVersionSupportsPrisma7('5.9.3')).toBe(true);
    expect(typescriptVersionSupportsPrisma7('6.0.0')).toBe(true);
    expect(typescriptVersionSupportsPrisma7('5.3.3')).toBe(false);
    expect(typescriptVersionSupportsPrisma7('5.4.0-beta.1')).toBe(false);
    expect(typescriptVersionSupportsPrisma7(null)).toBe(false);
  });

  it('parses stable semantic versions conservatively', () => {
    expect(parseStableSemver('5.4.0')).toEqual([5, 4, 0]);
    expect(parseStableSemver('v5.4.0')).toBeNull();
    expect(parseStableSemver('5.4')).toBeNull();
    expect(parseStableSemver('5.4.0-rc.1')).toBeNull();
  });

  it('accepts only the explicit JSON CLI option', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--unknown'])).toThrow('unsupported option: --unknown');
    expect(() => parseCliOptions(['--json', '--unknown'])).toThrow('unsupported option: --json --unknown');
  });

  it('prefers the installed TypeScript manifest when dependencies are present', () => {
    const readFile = jest.fn((filePath: string) => {
      if (filePath === 'node_modules/typescript/package.json') return JSON.stringify({ version: '5.9.3' });
      throw new Error(`unexpected read: ${filePath}`);
    });

    expect(
      readTypeScriptVersionEvidence({
        existsSync: (filePath: string) => filePath === 'node_modules/typescript/package.json',
        readFileSync: readFile,
      }),
    ).toEqual({
      version: '5.9.3',
      source: 'node_modules/typescript/package.json',
    });
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('falls back to package-lock evidence when node_modules is absent', () => {
    const readFile = jest.fn((filePath: string) => {
      if (filePath === 'package-lock.json') {
        return JSON.stringify({
          packages: {
            'node_modules/typescript': { version: '5.9.3' },
          },
        });
      }
      throw new Error(`unexpected read: ${filePath}`);
    });

    expect(
      readTypeScriptVersionEvidence({
        existsSync: () => false,
        readFileSync: readFile,
      }),
    ).toEqual({
      version: '5.9.3',
      source: 'package-lock.json#packages.node_modules/typescript',
    });
    expect(readFile).toHaveBeenCalledWith('package-lock.json', 'utf8');
  });

  it('requires strict and esModuleInterop explicitly', () => {
    const tsconfigSource = `
      {
        "compilerOptions": {
          "strict": true,
          "esModuleInterop": true
        }
      }
    `;
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion: '5.9.3',
      typescriptVersionSource: 'package-lock.json#packages.node_modules/typescript',
      tsconfigSource,
    });

    expect(extractBooleanCompilerOption(tsconfigSource, 'strict')).toBe(true);
    expect(extractBooleanCompilerOption(tsconfigSource, 'esModuleInterop')).toBe(true);
    expect(status.ready).toBe(true);
    expect(status.blockers).toEqual([]);
  });

  it('keeps missing or disabled compiler prerequisites visible as blockers', () => {
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion: '5.3.3',
      tsconfigSource: `
        {
          "compilerOptions": {
            "strict": false
          }
        }
      `,
    });

    expect(status.ready).toBe(false);
    expect(status.blockers).toEqual(['typescriptVersionAtLeast5_4', 'tsconfigStrict', 'tsconfigEsModuleInterop']);
  });

  it('guards the current repository lockfile and TypeScript prerequisites before the Prisma 7 migration', () => {
    const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      packages?: Record<string, { version?: string }>;
    };
    const typescriptVersion = getLockedTypeScriptVersion(lockfile);
    const tsconfigSource = readFileSync('tsconfig.json', 'utf8');
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion,
      typescriptVersionSource: 'package-lock.json#packages.node_modules/typescript',
      tsconfigSource,
    });

    expect(typescriptVersion).not.toBeNull();
    expect(status.ready).toBe(true);
    expect(status.checks.typescriptVersionAtLeast5_4).toBe(true);
    expect(status.checks.tsconfigStrict).toBe(true);
    expect(status.checks.tsconfigEsModuleInterop).toBe(true);
  });

  it('formats the evidence source and report as explicitly read-only', () => {
    const output = formatPrismaV7TypeScriptPrerequisites(
      inspectPrismaV7TypeScriptPrerequisites({
        typescriptVersion: '5.9.3',
        typescriptVersionSource: 'package-lock.json#packages.node_modules/typescript',
        tsconfigSource: `
          {
            "compilerOptions": {
              "strict": true,
              "esModuleInterop": true
            }
          }
        `,
      }),
    );

    expect(output).toContain('Prisma 7 TypeScript prerequisites (#3114)');
    expect(output).toContain('TypeScript evidence source: `package-lock.json#packages.node_modules/typescript`');
    expect(output).toContain('Overall readiness: `ready`');
    expect(output).toContain('This probe is read-only.');
  });

  it('formats the same readiness evidence as one JSON line', () => {
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion: '5.9.3',
      typescriptVersionSource: 'package-lock.json#packages.node_modules/typescript',
      tsconfigSource: `
        {
          "compilerOptions": {
            "strict": true,
            "esModuleInterop": true
          }
        }
      `,
    });

    const output = formatPrismaV7TypeScriptPrerequisites(status, { json: true });

    expect(output).toBe(`${JSON.stringify(status)}\n`);
    expect(JSON.parse(output)).toEqual(status);
    expect(output).not.toContain('## Prisma 7 TypeScript prerequisites');
  });
});
