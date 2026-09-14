import { inspectPrismaV7EnvLoading } from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment-loading conditional-expression evidence', () => {
  it('rejects a named config call on the right side of short-circuit AND', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        process.env.LOAD_ENV &&
          config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects a namespace config call in a ternary branch', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import * as dotenv from 'dotenv';
        import { defineConfig } from 'prisma/config';
        process.env.LOAD_ENV ?
          dotenv.config() :
          undefined;
        export default defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects CommonJS config calls on short-circuit OR and nullish-coalescing right sides', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        process.env.LOAD_ENV || require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });

    expect(
      inspectPrismaV7EnvLoading(`
        const { defineConfig } = require('prisma/config');
        process.env.LOAD_ENV ?? require('dotenv').config();
        module.exports = defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('accepts a config call that is evaluated before a later short-circuit operator', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        config() && noop();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('accepts a later unconditional call after conditional expression evidence is skipped', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        process.env.LOAD_ENV &&
          config();
        config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('resets conditional-expression state after a braced control-flow statement', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        if (process.env.A && process.env.B) {
          noop();
        }
        config();
        export default defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });
});
