import { extractCommonJsConstructs, maskCommentsAndStrings } from '../../scripts/prisma-v7-esm-surface.cjs';

describe('Prisma 7 ESM migration surface regex literals', () => {
  it('masks CommonJS-looking identifiers inside regex literals', () => {
    const source = String.raw`
      const globals = /__dirname|__filename/;
      const cjs = /module\.exports|exports\[|require\(/;
    `;

    expect(extractCommonJsConstructs(source)).toEqual([]);
  });

  it('does not let quote characters in a regex literal hide later executable CommonJS', () => {
    const source = `
      const quotePattern = /["']/;
      const fs = require('node:fs');
      const current = __filename;
    `;

    expect(maskCommentsAndStrings(source)).not.toContain('quotePattern = /');
    expect(extractCommonJsConstructs(source)).toEqual(['require-call', '__filename']);
  });

  it('preserves division expressions while masking a following regex operand', () => {
    const source = `
      const ratio = total / divisor / scale;
      const matched = value / /["']/.test(input);
      const fs = require('node:fs');
    `;

    expect(extractCommonJsConstructs(source)).toEqual(['require-call']);
  });

  it('recognizes regex literals after control-flow conditions', () => {
    const source = `
      if (enabled) /["']/.test(input);
      const fs = require('node:fs');
    `;

    expect(extractCommonJsConstructs(source)).toEqual(['require-call']);
  });

  it('keeps executable template interpolation code visible after a regex literal', () => {
    const source = `const result = \`value \${/["']/.test(input) ? require('node:fs') : null}\`;`;

    expect(extractCommonJsConstructs(source)).toEqual(['require-call']);
  });
});
