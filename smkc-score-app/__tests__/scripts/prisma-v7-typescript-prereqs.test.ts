import { readFileSync } from 'node:fs';

import {
  extractBooleanCompilerOption,
  formatPrismaV7TypeScriptPrerequisites,
  inspectPrismaV7TypeScriptPrerequisites,
  parseStableSemver,
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
    expect(status.blockers).toEqual([
      'typescriptVersionAtLeast5_4',
      'tsconfigStrict',
      'tsconfigEsModuleInterop',
    ]);
  });

  it('guards the current repository TypeScript prerequisites before the Prisma 7 migration', () => {
    const typescriptManifest = JSON.parse(
      readFileSync('node_modules/typescript/package.json', 'utf8'),
    ) as {
      version?: string;
    };
    const tsconfigSource = readFileSync('tsconfig.json', 'utf8');
    const status = inspectPrismaV7TypeScriptPrerequisites({
      typescriptVersion: typescriptManifest.version ?? null,
      tsconfigSource,
    });

    expect(status.ready).toBe(true);
    expect(status.checks.typescriptVersionAtLeast5_4).toBe(true);
    expect(status.checks.tsconfigStrict).toBe(true);
    expect(status.checks.tsconfigEsModuleInterop).toBe(true);
  });

  it('formats the evidence as an explicitly read-only report', () => {
    const output = formatPrismaV7TypeScriptPrerequisites(
      inspectPrismaV7TypeScriptPrerequisites({
        typescriptVersion: '5.9.3',
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
    expect(output).toContain('Overall readiness: `ready`');
    expect(output).toContain('This probe is read-only.');
  });
});
