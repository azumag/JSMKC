import {
  extractLegacyPrismaClientReferences,
  extractNextConfigReferences,
  formatPrismaV7SupportSurface,
  inspectPrismaV7SupportSurface,
  parseCliOptions,
} from '../../scripts/prisma-v7-support-surface.cjs';

describe('Prisma 7 support-code migration surface', () => {
  it('finds imports, runtime loads, and Jest module targets', () => {
    expect(
      extractLegacyPrismaClientReferences(`
        import { Prisma } from '@prisma/client';
        import type { PrismaClient } from "@prisma/client";
        const runtime = require('@prisma/client/runtime/library');
        const lazyClient = import("@prisma/client");
        jest.mock('@prisma/client', () => ({}));
        const actual = jest.requireActual('@prisma/client');
      `),
    ).toEqual([
      { kind: 'import', specifier: '@prisma/client' },
      { kind: 'runtime-load', specifier: '@prisma/client/runtime/library' },
      { kind: 'runtime-load', specifier: '@prisma/client' },
      { kind: 'jest-module-target', specifier: '@prisma/client' },
    ]);
  });

  it('records Next server externalization that must be rechecked after generated-client migration', () => {
    expect(
      extractNextConfigReferences(`
        export default {
          serverExternalPackages: ['@prisma/client', '.prisma/client'],
        };
      `),
    ).toEqual([{ kind: 'next-server-external', specifier: '@prisma/client' }]);
  });

  it('treats support-code references as migration work without changing application code', () => {
    const status = inspectPrismaV7SupportSurface({
      findings: [
        {
          path: '__tests__/lib/prisma-error.test.ts',
          references: [{ kind: 'import', specifier: '@prisma/client/runtime/library' }],
        },
        {
          path: 'jest.setup.js',
          references: [{ kind: 'jest-module-target', specifier: '@prisma/client' }],
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
      JSON.parse(
        formatPrismaV7SupportSurface(
          { ready: true, referenceCount: 0, findings: [] },
          { json: true },
        ),
      ),
    ).toEqual({ ready: true, referenceCount: 0, findings: [] });
  });
});
