import {
  findPrismaConfigNamespaceImports,
  inspectPrismaV7EnvLoading,
} from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment-loading Prisma config namespace boundaries', () => {
  it('rejects named dotenv loading after an ESM namespace defineConfig evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import * as prismaConfig from 'prisma/config';
        const evaluated = prismaConfig.defineConfig({});
        config();
        export default evaluated;
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('rejects CommonJS dotenv loading after a CommonJS namespace defineConfig evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const prismaConfig = require('prisma/config');
        const evaluated = prismaConfig.defineConfig({});
        require('dotenv').config();
        module.exports = evaluated;
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('uses the earliest namespace evaluation when named and namespace imports coexist', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig as makeConfig } from 'prisma/config';
        import * as prismaConfig from 'prisma/config';
        const first = prismaConfig.defineConfig({});
        config();
        export default makeConfig(first);
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('accepts explicit environment loading before namespace defineConfig evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import * as prismaConfig from 'prisma/config';
        config();
        export default prismaConfig.defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });

    expect(
      inspectPrismaV7EnvLoading(`
        const prismaConfig = require('prisma/config');
        require('dotenv').config();
        module.exports = prismaConfig.defineConfig({});
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('discovers only top-level Prisma config namespace bindings', () => {
    expect(
      findPrismaConfigNamespaceImports(`
        import * as prismaConfig from 'prisma/config';
        const prismaConfigCjs = require('prisma/config');
        const notNamespace = require('prisma/config').defineConfig;
      `),
    ).toEqual(['prismaConfig', 'prismaConfigCjs']);
  });
});
