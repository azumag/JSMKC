import {
  findCommonJsPrismaDefineConfigImport,
  findCommonJsPrismaDefineConfigImports,
  findNamedPrismaDefineConfigImport,
  findNamedPrismaDefineConfigImports,
  inspectPrismaV7EnvLoading,
} from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment-loading multiple defineConfig aliases', () => {
  it('uses the earliest ESM defineConfig alias evaluation as the environment-loading boundary', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig as lateConfig } from 'prisma/config';
        import { defineConfig as earlyConfig } from 'prisma/config';
        const evaluated = earlyConfig({});
        config();
        export default lateConfig(evaluated);
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('uses the earliest CommonJS defineConfig alias evaluation as the environment-loading boundary', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const { config: loadEnv } = require('dotenv');
        const { defineConfig: lateConfig } = require('prisma/config');
        const { defineConfig: earlyConfig } = require('prisma/config');
        const evaluated = earlyConfig({});
        loadEnv();
        module.exports = lateConfig(evaluated);
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('accepts environment loading before every discovered named defineConfig evaluation', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig as firstConfig } from 'prisma/config';
        import { defineConfig as secondConfig } from 'prisma/config';
        config();
        const evaluated = secondConfig({});
        export default firstConfig(evaluated);
      `),
    ).toEqual({ ready: true, mode: 'dotenv.config()' });
  });

  it('collects all named aliases while preserving the single-alias compatibility helpers', () => {
    const esmSource = `
      import { defineConfig as firstConfig } from 'prisma/config';
      import { defineConfig as secondConfig } from 'prisma/config';
    `;
    const commonJsSource = `
      const { defineConfig: firstConfig } = require('prisma/config');
      const { defineConfig: secondConfig } = require('prisma/config');
    `;

    expect(findNamedPrismaDefineConfigImports(esmSource)).toEqual(['firstConfig', 'secondConfig']);
    expect(findNamedPrismaDefineConfigImport(esmSource)).toBe('firstConfig');
    expect(findCommonJsPrismaDefineConfigImports(commonJsSource)).toEqual(['firstConfig', 'secondConfig']);
    expect(findCommonJsPrismaDefineConfigImport(commonJsSource)).toBe('firstConfig');
  });
});
