import { inspectPrismaV7EnvLoading, withoutCommentOnlyLines } from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment-loading regex literals', () => {
  it('rejects an unexecuted helper config call after a regex closing-brace token', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';

        function loadLater() {
          const closeBrace = /}/;
          config();
        }

        export default defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('keeps a top-level config call visible after quote characters inside a regex', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';

        const quotePattern = /["']/;
        config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('preserves ordinary division while masking regex body braces and quotes', () => {
    const source = `
      import { config } from 'dotenv';
      import { defineConfig } from 'prisma/config';

      const ratio = total / divisor;
      const pattern = /[{}"']/;
      config();
      export default defineConfig({});
    `;
    const masked = withoutCommentOnlyLines(source);

    expect(masked).toContain('total / divisor');
    expect(masked).not.toContain('const pattern = /');
    expect(inspectPrismaV7EnvLoading(source)).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('keeps CommonJS dotenv loading inside a helper non-qualifying after regex masking', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');

        function loadLater() {
          const closeBrace = /}/;
          require('dotenv').config();
        }

        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });
});
