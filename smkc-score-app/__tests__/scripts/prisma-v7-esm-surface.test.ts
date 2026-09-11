import {
  extractCommonJsConstructs,
  formatPrismaV7EsmSurface,
  inspectPrismaV7EsmSurface,
  maskCommentsAndStrings,
  parseCliOptions,
} from '../../scripts/prisma-v7-esm-surface.cjs';

describe('Prisma 7 ESM migration surface', () => {
  it('detects CommonJS loads, exports, and Node CommonJS globals', () => {
    expect(
      extractCommonJsConstructs(`
        const fs = require('node:fs');
        module.exports = { fs };
        exports.helper = fs;
        const base = __dirname;
        const current = __filename;
      `),
    ).toEqual(['require-call', 'module.exports', 'exports-member', '__dirname', '__filename']);
  });

  it('ignores CommonJS-looking text inside comments and strings', () => {
    const source = `
      // require('comment-only')
      /* module.exports = {}; */
      const note = "exports.helper and __dirname";
      const sample = 'require("string-only")';
      const template = \`module.exports = require('template-only')\`;
    `;

    expect(maskCommentsAndStrings(source)).not.toContain('comment-only');
    expect(extractCommonJsConstructs(source)).toEqual([]);
  });

  it('reports migration work without treating advisory evidence as a mutation', () => {
    const status = inspectPrismaV7EsmSurface({
      findings: [
        { path: 'scripts/security-audit-status.js', constructs: ['require-call', 'module.exports'] },
        { path: 'e2e/run-preview.js', constructs: ['require-call', '__dirname'] },
      ],
    });

    expect(status).toEqual({
      ready: false,
      fileCount: 2,
      constructCount: 4,
      findings: expect.any(Array),
    });

    const output = formatPrismaV7EsmSurface(status);
    expect(output).toContain('Top-level type=module readiness: `not-ready`');
    expect(output).toContain('scripts/security-audit-status.js');
    expect(output).toContain('renaming to `.cjs`');
    expect(output).toContain('read-only migration evidence');
  });

  it('reports ready when no CommonJS JavaScript helper remains', () => {
    expect(inspectPrismaV7EsmSurface({ findings: [] })).toEqual({
      ready: true,
      fileCount: 0,
      constructCount: 0,
      findings: [],
    });
  });

  it('supports JSON output and rejects mutating or unknown options', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--write'])).toThrow('unsupported option');

    expect(
      JSON.parse(
        formatPrismaV7EsmSurface({ ready: true, fileCount: 0, constructCount: 0, findings: [] }, { json: true }),
      ),
    ).toEqual({ ready: true, fileCount: 0, constructCount: 0, findings: [] });
  });
});
