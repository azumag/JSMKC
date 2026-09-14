import { inspectPrismaV7EnvLoading } from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment-loading control-flow evidence', () => {
  it('rejects named dotenv config calls in unbraced conditional bodies', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        if (process.env.LOAD_ENV)
          config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects namespace dotenv config calls in unbraced else bodies', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import * as dotenv from 'dotenv';
        import { defineConfig } from 'prisma/config';
        if (false) noop();
        else
          dotenv.config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects CommonJS dotenv config calls in unbraced loop bodies', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        for (let index = 0; index < 1; index += 1)
          require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        do
          require('dotenv').config();
        while (false);
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('keeps parenthesized defineConfig evaluation as an ordering boundary', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        export default (defineConfig({}));
        config();
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('still accepts a later unconditional call after conditional evidence is skipped', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        if (false)
          config();
        config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });
});
