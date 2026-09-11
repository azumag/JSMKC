import {
  DEFAULT_TARGETS,
  extractLegacyPrismaClientReferences,
  extractNextConfigReferences,
  formatPrismaV7SupportSurface,
  inspectPrismaV7SupportSurface,
  parseCliOptions,
} from '../../scripts/prisma-v7-support-surface.cjs';

describe('Prisma 7 support-code migration surface', () => {
  const prismaClientSpecifier = '@prisma' + '/client';
  const prismaRuntimeSpecifier = `${prismaClientSpecifier}/runtime/library`;

  it('finds imports, runtime loads, and Jest module targets', () => {
    expect(
      extractLegacyPrismaClientReferences(`
        import { Prisma } from '${prismaClientSpecifier}';
        import type { PrismaClient } from "${prismaClientSpecifier}";
        const runtime = require('${prismaRuntimeSpecifier}');
        const lazyClient = import("${prismaClientSpecifier}");
        jest.mock('${prismaClientSpecifier}', () => ({}));
        const actual = jest.requireActual('${prismaClientSpecifier}');
      `),
    ).toEqual([
      { kind: 'import', specifier: prismaClientSpecifier },
      { kind: 'runtime-load', specifier: prismaRuntimeSpecifier },
      { kind: 'runtime-load', specifier: prismaClientSpecifier },
      { kind: 'jest-module-target', specifier: prismaClientSpecifier },
    ]);
  });

  it('does not treat prose-only package mentions as imports', () => {
    expect(
      extractLegacyPrismaClientReferences(`
        // Error classes come from '${prismaRuntimeSpecifier}' in Prisma 6.
        const note = "types come from '${prismaClientSpecifier}' after generation";
      `),
    ).toEqual([]);
  });

  it('records Next server externalization that must be rechecked after generated-client migration', () => {
    expect(
      extractNextConfigReferences(`
        export default {
          serverExternalPackages: ['${prismaClientSpecifier}', '.prisma/client'],
        };
      `),
    ).toEqual([{ kind: 'next-server-external', specifier: prismaClientSpecifier }]);
  });

  it('keeps the explicit CommonJS Jest setup in the support-code inventory', () => {
    expect(DEFAULT_TARGETS).toContain('jest.setup.cjs');
    expect(DEFAULT_TARGETS).not.toContain('jest.setup.js');
  });

  it('treats support-code references as migration work without changing application code', () => {
    const status = inspectPrismaV7SupportSurface({
      findings: [
        {
          path: '__tests__/lib/prisma-error.test.ts',
          references: [{ kind: 'import', specifier: prismaRuntimeSpecifier }],
        },
        {
          path: 'jest.setup.cjs',
          references: [{ kind: 'jest-module-target', specifier: prismaClientSpecifier }],
        },
      ],
    });

    expect(status).toEqual({
      ready: false,
      referenceCount: 2,
      findings: expect.any(Array),
    });

    const output = formatPrismaV7SupportSurface(status);
    expect(output).toContain('Support-code readiness: `not-ready` (2 legacy reference(s))');
    expect(output).toContain('__tests__/lib/prisma-error.test.ts');
    expect(output).toContain('jest-module-target');
    expect(output).toContain('read-only migration evidence');
  });

  it('reports ready when no support-code references remain', () => {
    expect(inspectPrismaV7SupportSurface({ findings: [] })).toEqual({
      ready: true,
      referenceCount: 0,
      findings: [],
    });
  });

  it('supports JSON output and rejects mutating or unknown options', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--write'])).toThrow('unsupported option');

    expect(
      JSON.parse(formatPrismaV7SupportSurface({ ready: true, referenceCount: 0, findings: [] }, { json: true })),
    ).toEqual({ ready: true, referenceCount: 0, findings: [] });
  });
});
